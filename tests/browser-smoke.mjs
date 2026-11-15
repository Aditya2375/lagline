import { spawn } from "node:child_process";
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  mkdtempSync,
} from "node:fs";

const HTTP_PORT = 8969;
const CDP_PORT = 9370;
const SHOTS = process.env.SMOKE_SHOTS === "1";
const root = new URL("..", import.meta.url).pathname;

const profile = mkdtempSync("/tmp/lagline-chrome-");
const server = spawn(
  "python3",
  [
    "-m",
    "http.server",
    String(HTTP_PORT),
    "--bind",
    "127.0.0.1",
    "--directory",
    `${root}docs`,
  ],
  { stdio: "ignore", detached: true },
);
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore", detached: true },
);

const cleanup = async (code) => {
  for (const child of [chrome, server]) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  await Promise.all(
    [chrome, server].map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise((r) => child.once("exit", r)),
    ),
  );
  rmSync(profile, { recursive: true, force: true });
  process.exit(code);
};
const timeout = setTimeout(() => {
  console.error("smoke: timeout");
  cleanup(1);
}, 90000);
process.on("SIGINT", () => cleanup(2));
process.on("uncaughtException", (e) => {
  console.error(e);
  cleanup(1);
});
process.on("unhandledRejection", (e) => {
  console.error(e);
  cleanup(1);
});

async function waitFor(fn, label, timeoutMs = 60000) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    if (Date.now() - start > timeoutMs)
      throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(
    `${ok ? "ok" : "NOT OK"} - ${name}${detail ? " - " + detail : ""}`,
  );
};

await waitFor(
  async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok,
  "chrome devtools",
);
const target = await (
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: "PUT" })
).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let mid = 0;
const rpcPending = new Map();
const consoleErrors = [];
const requests = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === "Network.requestWillBeSent")
    requests.push(msg.params.request.url);
  if (msg.id && rpcPending.has(msg.id)) {
    rpcPending.get(msg.id)(msg);
    rpcPending.delete(msg.id);
  } else if (msg.method === "Runtime.exceptionThrown")
    consoleErrors.push(
      msg.params.exceptionDetails?.exception?.description ?? "page exception",
    );
};
const cdp = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++mid;
    rpcPending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const res = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.result?.exceptionDetails)
    throw new Error(JSON.stringify(res.result.exceptionDetails));
  return res.result?.result?.value;
};
const shot = async (name) => {
  if (!SHOTS) return;
  await new Promise((r) => setTimeout(r, 900));
  const metrics = await cdp("Page.getLayoutMetrics");
  const size = metrics.result.cssContentSize;
  const r = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
  });
  writeFileSync(
    `${root}smoke-${name}.png`,
    Buffer.from(r.result.data, "base64"),
  );
};

const { generate, csv, run } = await import("../web/src/model.js");
mkdirSync(`${root}build/fixtures`, { recursive: true });
const good = generate().map((b) => ({ ...b, open: 100.1, close: 100.1 }));
writeFileSync(`${root}build/fixtures/good.csv`, csv(good));
writeFileSync(
  `${root}build/fixtures/bad.csv`,
  csv(good).replace("2020-01-02", "2020-01-01"),
);
const evil = generate();
for (const b of evil) b.open = 1000000;
for (const t of run(generate(), 20, 100, 0).fills)
  if (t.side === "BUY") evil[t.index].open = 0.01;
writeFileSync(`${root}build/fixtures/evil.csv`, csv(evil));
const extreme = generate(0, 200).map((b, i) => ({
  ...b,
  open: i === 160 ? 0.01 : 1000000,
  close: 1000 + i,
}));
writeFileSync(`${root}build/fixtures/extreme.csv`, csv(extreme));
const setFile = async (name) => {
  const doc = await cdp("DOM.getDocument"),
    node = await cdp("DOM.querySelector", {
      nodeId: doc.result.root.nodeId,
      selector: "#file",
    });
  await cdp("DOM.setFileInputFiles", {
    nodeId: node.result.nodeId,
    files: [`${root}build/fixtures/${name}`],
  });
};
await cdp("Runtime.enable");
await cdp("Network.enable");
await cdp("Page.enable");
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 960,
  deviceScaleFactor: 1,
  mobile: false,
});
await cdp("Page.navigate", { url: `http://127.0.0.1:${HTTP_PORT}/` });
await waitFor(
  () => evaluate(`document.querySelector('#net')?.textContent.includes('%')`),
  "ready",
);
check(
  "common160 warmup leaves560 bars",
  await evaluate(
    `document.querySelector('#cursor').max==='559'&&document.querySelectorAll('.metric').length===4`,
  ),
);
check(
  "first execution uses prior date not current close",
  await evaluate(
    `document.querySelector('#prior').textContent==='2020-08-11'&&document.querySelector('#selected-date').textContent==='2020-08-12'`,
  ),
);
check(
  "initial entry uses openingprice with charge",
  await evaluate(
    `document.querySelector('#action').textContent==='Buy shares'&&Number(document.querySelector('#barfee').textContent.split(' ')[0])>0`,
  ),
);
check(
  "CSP disallows connections",
  await evaluate(
    `document.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes("connect-src 'none'")`,
  ),
);
await shot("default");
const change = async (id, value) =>
  evaluate(
    `document.querySelector('${id}').value='${value}';document.querySelector('${id}').dispatchEvent(new Event('change'));true`,
  );
const pick = async (value) =>
  evaluate(
    `document.querySelector('#cursor').value='${value}';document.querySelector('#cursor').dispatchEvent(new Event('input'));true`,
  );
await pick(559);
check(
  "terminal forcesflat, explains different close exit",
  await evaluate(
    `document.querySelector('#shares').textContent==='0.000000'&&document.querySelector('#end-note').textContent.includes('End of sample')`,
  ),
);
await pick(240);
const date = await evaluate(
  `document.querySelector('#selected-date').textContent`,
);
await change("#fast", 40);
check(
  "parameterchange preserves inspecteddate",
  date ===
    (await evaluate(`document.querySelector('#selected-date').textContent`)),
);
await change("#cost", 0);
const zero = await evaluate(`document.querySelector('#net').textContent`);
check(
  "zerocost actual ledgercharges0",
  await evaluate(`document.querySelector('#fees').textContent==='0.00 units'`),
);
await change("#cost", 20);
check(
  "cost lowerswealth",
  (await evaluate(`document.querySelector('#net').textContent`)) !== zero,
);
for (const source of [1, 2]) {
  await change("#source", source);
  check(
    `control${source}changesprovenance`,
    await evaluate(
      `document.querySelector('#source-note').textContent.includes('${source === 1 ? "Short reversals" : "Opening gaps"}')`,
    ),
  );
}
await setFile("good.csv");
await waitFor(
  () =>
    evaluate(
      `document.querySelector('#source-note').textContent.startsWith('LOCAL')`,
    ),
  "local data",
);
check(
  "noninteger constant prices treated equalitycash",
  await evaluate(
    `document.querySelector('#net').textContent==='0.00%'&&document.querySelector('#fill-count').textContent.startsWith('0 fills')`,
  ),
);
check(
  "no local filename display",
  !(await evaluate(`document.body.innerText`)).includes("good.csv"),
);
await setFile("bad.csv");
await waitFor(
  () =>
    evaluate(
      `document.querySelector('#status').textContent.startsWith('Not read')`,
    ),
  "invalid replacement",
);
check(
  "invalidreplacement preservespreviousdata",
  await evaluate(
    `document.querySelector('#source-note').textContent.startsWith('LOCAL')&&document.querySelector('#net').textContent==='0.00%'`,
  ),
);
// Patch only the local test File object to exercise reset while its asynchronous read is pending.
await evaluate(
  `window.originalFileText=File.prototype.text;File.prototype.text=function(){return new Promise(resolve=>setTimeout(()=>resolve('date,open,close\\n'),300));};true`,
);
await setFile("good.csv");
await evaluate(`document.querySelector('#reset').click();true`);
await new Promise((r) => setTimeout(r, 500));
check(
  "reset invalidates pendingread",
  await evaluate(
    `document.querySelector('#source-note').textContent.startsWith('GENERATED / Slow waves')&&document.querySelector('#fast').value==='20'&&document.querySelector('#cost').value==='5'`,
  ),
);
await evaluate(
  `File.prototype.text=window.originalFileText;delete window.originalFileText;true`,
);
await change("#cost", 0);
await setFile("evil.csv");
await waitFor(
  () =>
    evaluate(
      `document.querySelector('#status').textContent.includes('Wealth')`,
    ),
  "unsupported wealth",
);
check(
  "failed candidate run preserves generated data",
  await evaluate(
    `document.querySelector('#source-note').textContent.startsWith('GENERATED')`,
  ),
);
await evaluate(`document.querySelector('#reset').click();true`);
// Downloads must always contain generated prices even after a private local series was read.
await setFile("good.csv");
await waitFor(
  () =>
    evaluate(
      `document.querySelector('#source-note').textContent.startsWith('LOCAL')`,
    ),
  "local again",
);
check(
  "download remainsgenerated",
  await evaluate(
    `(async()=>{const old=URL.createObjectURL;let text='';URL.createObjectURL=b=>{b.text().then(t=>text=t);return old(b);};document.querySelector('#example').click();await new Promise(r=>setTimeout(r,100));URL.createObjectURL=old;return text.startsWith('date,open,close\\n')&&!text.includes(',100.10000000,100.10000000');})()`,
  ),
);
await evaluate(`document.querySelector('#reset').click();true`);
for (const width of [320, 360, 390, 768]) {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await new Promise((r) => setTimeout(r, 250));
  check(
    `${width}px no horizontaloverflow`,
    await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),
  );
  check(
    `${width}px charts uselivepixelviewbox`,
    await evaluate(
      `Number(document.querySelector('#wealth-chart').viewBox.baseVal.width)<innerWidth`,
    ),
  );
  await shot(`mobile-${width}`);
}
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 960,
  deviceScaleFactor: 1,
  mobile: false,
});
await new Promise((r) => setTimeout(r, 150));
await setFile("extreme.csv");
await waitFor(
  () =>
    evaluate(
      `document.querySelector('#source-note').textContent.startsWith('LOCAL')`,
    ),
  "extreme valid run",
);
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 320,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await new Promise((r) => setTimeout(r, 200));
check(
  "extreme valid prices no horizontaloverflow",
  await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),
);
await evaluate(`document.querySelector('#reset').click();true`);
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 960,
  deviceScaleFactor: 1,
  mobile: false,
});
await pick(559);
await evaluate(`document.querySelector('.ledger').open=true;true`);
await shot("terminal-ledger");
check(
  "no userdata storage",
  await evaluate(`localStorage.length===0&&sessionStorage.length===0`),
);
check(
  "no browser exceptions",
  consoleErrors.length === 0,
  consoleErrors.join("; "),
);
const unexpected = requests.filter(
  (u) =>
    !u.startsWith(`http://127.0.0.1:${HTTP_PORT}/`) &&
    !u.startsWith("blob:") &&
    u !== "about:blank",
);
check("no off-origin requests", unexpected.length === 0, unexpected.join("; "));
writeFileSync(
  `${root}build/browser-result.json`,
  JSON.stringify(checks, null, 2),
);
const failures = checks.filter((c) => !c.ok);
console.log(`${checks.length} browser checks; ${failures.length} failed`);
clearTimeout(timeout);
ws.close();
await cleanup(failures.length ? 1 : 0);
