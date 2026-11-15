import { generate, run, parseCSV, csv } from "./model.js";
const $ = (s) => document.querySelector(s),
  put = (id, v) => ($(id).textContent = v);
const fmt = (v, n = 2) =>
    v.toLocaleString("en-US", {
      minimumFractionDigits: n,
      maximumFractionDigits: n,
    }),
  pct = (v) =>
    Math.abs(v) < 0.00005
      ? "0.00%"
      : (v > 0 ? "+" : "") +
        (Math.abs(v * 100) >= 10000
          ? (v * 100).toExponential(2)
          : fmt(v * 100)) +
        "%";
let bars = generate(),
  local = false,
  generation = 0,
  result,
  selection = 0;
const NS = "http://www.w3.org/2000/svg";
function node(tag, attrs, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
}
function chart(id, series, dates, selected) {
  const svg = $(id);
  svg.replaceChildren();
  const w = Math.max(240, svg.clientWidth),
    h = 260,
    L = 62,
    R = 12,
    T = 16,
    B = 32,
    iw = w - L - R,
    ih = h - T - B;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  let lo = Infinity,
    hi = -Infinity;
  for (const s of series)
    for (const v of s.values) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  const pad = Math.max((hi - lo) * 0.12, Math.abs(hi) * 0.005, 0.01);
  lo -= pad;
  hi += pad;
  const x = (i) => L + (i / (dates.length - 1)) * iw,
    y = (v) => T + ((hi - v) / (hi - lo)) * ih,
    axis = (v) =>
      Math.abs(v) >= 1e9
        ? (v / 1e9).toFixed(1) + "b"
        : Math.abs(v) >= 1e6
          ? (v / 1e6).toFixed(1) + "m"
          : Math.abs(v) >= 10000
            ? fmt(v, 0)
            : fmt(v, 1);
  for (let j = 0; j <= 4; j++) {
    const v = lo + ((hi - lo) * j) / 4,
      yy = y(v);
    svg.append(
      node("line", {
        x1: L,
        x2: w - R,
        y1: yy,
        y2: yy,
        stroke: "#e1e1d9",
        "stroke-width": 1,
      }),
    );
    svg.append(
      node("text", { x: L - 9, y: yy + 4, "text-anchor": "end" }, axis(v)),
    );
  }
  for (const i of [0, Math.floor((dates.length - 1) / 2), dates.length - 1])
    svg.append(
      node(
        "text",
        {
          x: x(i),
          y: h - 7,
          "text-anchor":
            i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle",
        },
        dates[i].slice(0, 7),
      ),
    );
  for (const s of series)
    svg.append(
      node("path", {
        d: s.values
          .map(
            (v, i) => (i ? "L" : "M") + x(i).toFixed(2) + "," + y(v).toFixed(2),
          )
          .join(" "),
        fill: "none",
        stroke: s.color,
        "stroke-width": 2,
        "stroke-dasharray": s.dashed ? "6 4" : "none",
        "stroke-linejoin": "round",
      }),
    );
  svg.append(
    node("line", {
      x1: x(selected),
      x2: x(selected),
      y1: T,
      y2: h - B,
      stroke: "#8c8d84",
      "stroke-width": 1,
      "stroke-dasharray": "3 4",
    }),
  );
  const s = series[0];
  svg.append(
    node("circle", {
      cx: x(selected),
      cy: y(s.values[selected]),
      r: 4,
      fill: s.color,
      stroke: "#fffdf8",
      "stroke-width": 2,
    }),
  );
}
function charts() {
  const f = +$("#fast").value,
    s = +$("#slow").value,
    rr = result.rows,
    mean = (i, n) => {
      let v = 0;
      for (let j = i - n + 1; j <= i; j++) v += bars[j].close;
      return v / n;
    },
    dates = rr.map((r) => bars[r.index].date);
  chart(
    "#price-chart",
    [
      { values: rr.map((r) => bars[r.index].close), color: "#182934" },
      { values: rr.map((r) => mean(r.index, f)), color: "#ab471f" },
      { values: rr.map((r) => mean(r.index, s)), color: "#376f91" },
    ],
    dates,
    selection,
  );
  chart(
    "#wealth-chart",
    [
      { values: [10000, ...rr.map((r) => r.equity)], color: "#246758" },
      {
        values: [10000, ...rr.map((r) => r.benchmark)],
        color: "#837130",
        dashed: true,
      },
    ],
    [bars[159].date, ...dates],
    selection + 1,
  );
}
function inspect() {
  const r = result.rows[selection],
    b = bars[r.index];
  put("#selected-date", b.date);
  $("#cursor").setAttribute("aria-valuetext", b.date);
  put("#prior", bars[r.index - 1].date);
  put("#ifast", fmt(r.fast, 6));
  put("#islow", fmt(r.slow, 6));
  put("#target", r.target ? "LONG / 100%" : "CASH / 0%");
  put(
    "#action",
    ["Stay in cash", "Keep shares", "Buy shares", "Sell shares"][r.action],
  );
  put("#open", fmt(b.open, 6));
  put("#barfee", fmt(r.fee, 6) + " units");
  put("#equity", fmt(r.equity) + " units");
  put("#shares", fmt(r.shares, 6));
  put("#cash", fmt(r.cash, 6));
  put("#bardd", pct(r.drawdown));
  const signal = r.target ? "Fast exceeds slow." : "Fast does not exceed slow.";
  put(
    "#end-note",
    r.terminal
      ? "End of sample: any remaining strategy and benchmark shares are sold at this close, with charges. The last close signal is not executed. This predeclared exit is not a crossover."
      : `${signal} This bar's close cannot affect its opening target. Fees are charged on executed notional; no trade means no fee.`,
  );
  charts();
}
function render() {
  result = run(bars, +$("#fast").value, +$("#slow").value, +$("#cost").value);
  selection = Math.min(selection, result.rows.length - 1);
  $("#cursor").max = String(result.rows.length - 1);
  $("#cursor").value = String(selection);
  const last = result.rows.at(-1),
    net = last.equity / 10000 - 1,
    bench = last.benchmark / 10000 - 1;
  put("#net", pct(net));
  put("#benchmark", pct(bench));
  put(
    "#difference",
    `${fmt((net - bench) * 100)} percentage points vs benchmark`,
  );
  put("#drawdown", pct(result.maxDrawdown));
  put(
    "#fees",
    (last.fees >= 1e6
      ? last.fees.toLocaleString("en-US", {
          notation: "compact",
          maximumFractionDigits: 2,
        })
      : fmt(last.fees)) + " units",
  );
  put(
    "#trades",
    `${result.fills.length / 2} completed round trips · benchmark charges ${fmt(last.benchmarkFees)} units`,
  );
  const label = ["Slow waves", "Short reversals", "Opening gaps"][
    +$("#source").value
  ];
  put(
    "#source-note",
    local
      ? `LOCAL CSV / ${bars.length} bars / ${result.rows.length} evaluated / unit and adjustment consistency unverified`
      : `GENERATED / ${label} / ${bars.length} weekday bars, no holiday calendar / ${result.rows.length} evaluated / engineered controls, not market evidence`,
  );
  const tbody = $("#ledger");
  tbody.replaceChildren();
  if (!result.fills.length) {
    const tr = document.createElement("tr"),
      td = document.createElement("td");
    td.colSpan = 6;
    td.textContent =
      "No strategy fills. The long/cash condition never entered a position.";
    tr.append(td);
    tbody.append(tr);
  }
  for (const t of result.fills) {
    const tr = document.createElement("tr");
    for (const v of [
      bars[t.index].date,
      `${t.side} / ${t.phase}`,
      fmt(t.price, 6),
      fmt(t.quantity, 6),
      fmt(t.fee, 6),
      fmt(t.cash, 6),
    ]) {
      const td = document.createElement("td");
      td.textContent = v;
      tr.append(td);
    }
    tbody.append(tr);
  }
  put(
    "#fill-count",
    `${result.fills.length} fills · terminal exit included when needed`,
  );
  inspect();
}
let accepted = ["20", "100", "5"];
for (const id of ["#fast", "#slow", "#cost"])
  $(id).addEventListener("change", () => {
    try {
      run(bars, +$("#fast").value, +$("#slow").value, +$("#cost").value);
      render();
      accepted = ["#fast", "#slow", "#cost"].map((x) => $(x).value);
    } catch (e) {
      ["#fast", "#slow", "#cost"].forEach((x, i) => ($(x).value = accepted[i]));
      put(
        "#status",
        `Setting not applied: ${e.message} Previous settings are unchanged.`,
      );
    }
  });
$("#cursor").addEventListener("input", () => {
  selection = +$("#cursor").value;
  inspect();
});
$("#source").addEventListener("change", () => {
  generation++;
  local = false;
  bars = generate(+$("#source").value);
  $("#file").value = "";
  selection = 0;
  put(
    "#status",
    "Generated control restored. Local data is no longer referenced by this page.",
  );
  render();
});
$("#reset").addEventListener("click", () => {
  generation++;
  local = false;
  bars = generate();
  selection = 0;
  $("#source").value = "0";
  $("#fast").value = "20";
  $("#slow").value = "100";
  $("#cost").value = "5";
  accepted = ["20", "100", "5"];
  $("#file").value = "";
  put(
    "#status",
    "Lab reset. Local data is no longer referenced by this page. This is not secure erasure.",
  );
  render();
});
$("#file").addEventListener("change", async () => {
  const mine = ++generation,
    file = $("#file").files[0];
  if (!file) return;
  try {
    if (file.size > 200000) throw Error("CSV limit is 200,000 bytes.");
    const text = await file.text();
    if (mine !== generation) return;
    const a = parseCSV(text);
    run(a, +$("#fast").value, +$("#slow").value, +$("#cost").value);
    bars = a;
    local = true;
    selection = 0;
    render();
    put(
      "#status",
      "Local CSV read into page memory. No upload, storage or local-data export. Reset to discard this page reference.",
    );
  } catch (e) {
    if (mine === generation)
      put(
        "#status",
        `Not read: ${e.message} Previous data and settings are unchanged.`,
      );
  } finally {
    if (mine === generation) $("#file").value = "";
  }
});
$("#example").addEventListener("click", () => {
  const url = URL.createObjectURL(
      new Blob([csv(generate(2))], { type: "text/csv;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "lagline-generated-example.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
let resized;
window.addEventListener("resize", () => {
  clearTimeout(resized);
  resized = setTimeout(charts, 100);
});
render();
