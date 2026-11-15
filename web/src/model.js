export function generate(kind = 0, count = 720) {
  if (
    ![0, 1, 2].includes(kind) ||
    !Number.isInteger(count) ||
    count < 200 ||
    count > 2000
  )
    throw Error("Control/count");
  const a = [];
  let d = new Date("2020-01-01T00:00:00Z"),
    p = 100;
  for (let i = 0; i < count; i++) {
    while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
    const overnight =
      kind === 2
        ? i % 80 === 0
          ? 0.075
          : i % 80 === 40
            ? -0.065
            : 0
        : 0.001 * Math.sin(i * 0.73);
    const intraday =
      kind === 0
        ? 0.0017 * Math.sin(i / 75) + 0.00025 + 0.002 * Math.sin(i * 0.31)
        : kind === 1
          ? 0.006 * Math.sin(i * 0.25) + 0.001 * Math.sin(i * 0.91)
          : 0.001 * Math.sin(i / 45) - overnight * 0.65;
    const open = p * Math.exp(overnight);
    p = open * Math.exp(intraday);
    a.push({ date: d.toISOString().slice(0, 10), open, close: p });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return a;
}
export function validate(a) {
  if (!Array.isArray(a) || a.length < 200 || a.length > 2000)
    throw Error("Use 200 to 2,000 price rows.");
  let prev = "";
  for (const b of a) {
    if (
      !b ||
      !/^(19|20)\d{2}-\d{2}-\d{2}$/.test(b.date) ||
      !Number.isFinite(Date.parse(b.date + "T00:00:00Z")) ||
      new Date(b.date + "T00:00:00Z").toISOString().slice(0, 10) !== b.date ||
      b.date <= prev
    )
      throw Error("Dates must be real, increasing ISO dates in 1900-2099.");
    for (const x of [b.open, b.close])
      if (!Number.isFinite(x) || x < 0.01 || x > 1e6)
        throw Error("Prices must be finite decimals from 0.01 to 1,000,000.");
    prev = b.date;
  }
}
export function parseCSV(s) {
  if (typeof s !== "string" || new TextEncoder().encode(s).length > 200000)
    throw Error("CSV limit is 200,000 bytes.");
  const lines = s
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  if (lines.shift() !== "date,open,close")
    throw Error("Header must be date,open,close.");
  const a = lines.map((l) => {
    const t = l.split(",");
    if (
      t.length !== 3 ||
      !t.slice(1).every((x) => /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(x))
    )
      throw Error(
        "Use plain unquoted decimal prices, no exponents, separators or extra columns.",
      );
    return { date: t[0], open: Number(t[1]), close: Number(t[2]) };
  });
  validate(a);
  return a;
}
export const csv = (a) =>
  "date,open,close\n" +
  a
    .map((b) => `${b.date},${b.open.toFixed(8)},${b.close.toFixed(8)}`)
    .join("\n") +
  "\n";
export function run(a, fast = 20, slow = 100, bps = 5) {
  validate(a);
  if (
    ![10, 20, 40].includes(fast) ||
    ![60, 100, 160].includes(slow) ||
    ![0, 5, 20].includes(bps)
  )
    throw Error("Unsupported setting.");
  let cash = 10000,
    shares = 0,
    fees = 0,
    bs = 0,
    bf = 0,
    bc = 0,
    peak = 10000,
    bpeak = 10000,
    maxDrawdown = 0,
    benchmarkMaxDrawdown = 0;
  const fee = bps / 10000,
    rows = [],
    fills = [];
  for (let i = 160; i < a.length; i++) {
    let f = 0,
      s = 0;
    for (let j = i - fast; j < i; j++) f += a[j].close;
    for (let j = i - slow; j < i; j++) s += a[j].close;
    f /= fast;
    s /= slow;
    const target = f - s > 1e-12 * Math.max(f, s) ? 1 : 0,
      b = a[i];
    let action = shares > 0 ? 1 : 0,
      paid = 0;
    if (i === 160) {
      bs = 10000 / (b.open * (1 + fee));
      bf = bs * b.open * fee;
    }
    if (target === 1 && shares === 0) {
      shares = cash / (b.open * (1 + fee));
      paid = shares * b.open * fee;
      cash = 0;
      action = 2;
      fills.push({
        index: i,
        side: "BUY",
        phase: "open",
        price: b.open,
        quantity: shares,
        fee: paid,
        cash,
        shares,
      });
    } else if (target === 0 && shares > 0) {
      const q = shares;
      paid = q * b.open * fee;
      cash = q * b.open - paid;
      shares = 0;
      action = 3;
      fills.push({
        index: i,
        side: "SELL",
        phase: "open",
        price: b.open,
        quantity: q,
        fee: paid,
        cash,
        shares,
      });
    }
    const terminal = i === a.length - 1;
    if (terminal) {
      bc = bs * b.close * (1 - fee);
      bf += bs * b.close * fee;
      bs = 0;
      if (shares > 0) {
        const q = shares,
          fc = q * b.close * fee;
        paid += fc;
        cash = q * b.close - fc;
        shares = 0;
        fills.push({
          index: i,
          side: "SELL",
          phase: "end close",
          price: b.close,
          quantity: q,
          fee: fc,
          cash,
          shares,
        });
      }
    }
    fees += paid;
    const equity = cash + shares * b.close,
      benchmark = bc + bs * b.close;
    peak = Math.max(peak, equity);
    bpeak = Math.max(bpeak, benchmark);
    const drawdown = equity / peak - 1;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
    benchmarkMaxDrawdown = Math.min(
      benchmarkMaxDrawdown,
      benchmark / bpeak - 1,
    );
    if (
      !Number.isFinite(equity) ||
      !Number.isFinite(benchmark) ||
      equity < 1e-12 ||
      benchmark < 1e-12 ||
      equity > 1e12 ||
      benchmark > 1e12
    )
      throw Error("Wealth is outside supported 1e-12 to 1e12 units.");
    rows.push({
      index: i,
      fast: f,
      slow: s,
      target,
      action,
      shares,
      cash,
      equity,
      benchmark,
      fee: paid,
      fees,
      benchmarkFees: bf,
      drawdown,
      terminal,
    });
  }
  return { rows, fills, maxDrawdown, benchmarkMaxDrawdown };
}
