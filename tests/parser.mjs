import assert from "node:assert/strict";
import { generate, csv, parseCSV, run } from "../web/src/model.js";
let n = 0;
const test = (name, fn) => {
  fn();
  n++;
};
const good = csv(generate());
for (const [name, change] of Object.entries({
  header: (s) => s.replace("date,open,close", "date,close,open"),
  negative: (s) => s.replace(",100.", ",-100."),
  nan: (s) => s.replace(/\d+\.\d+/, "NaN"),
  exponent: (s) => s.replace(/\d+\.\d+/, "1e2"),
  formula: (s) => s.replace(/\d+\.\d+/, "=1+2"),
  duplicate: (s) => s.replace("2020-01-02", "2020-01-01"),
  invaliddate: (s) => s.replace("2020-01-01", "2020-02-30"),
  zero: (s) => s.replace(/\d+\.\d+/, "0"),
  big: (s) => s.replace(/\d+\.\d+/, "1000001"),
  blank: (s) => s.replace("\n2020-01-02", "\n\n2020-01-02"),
  quote: (s) => s.replace(/\d+\.\d+/, '"100"'),
  extra: (s) => s.replace("\n", "\n2020-01-01,1,2,3\n"),
  short: () => good.split("\n").slice(0, 199).join("\n"),
  long: () => good.repeat(3),
  old: (s) => s.replace("2020-01-01", "1899-01-01"),
}))
  test(name, () => assert.throws(() => parseCSV(change(good)), name));
test("valid", () => assert.equal(parseCSV(good).length, 720));
test("BOM CRLF", () =>
  assert.equal(parseCSV("\uFEFF" + good.replaceAll("\n", "\r\n")).length, 720));
test("bytes", () => assert.throws(() => parseCSV("x".repeat(200001))));
const a = generate(2);
for (const f of [10, 20, 40])
  for (const s of [60, 100, 160])
    for (const c of [0, 5, 20]) {
      test("scale invariance", () => {
        const r = run(a, f, s, c),
          v = run(
            a.map((x) => ({ ...x, open: x.open * 3, close: x.close * 3 })),
            f,
            s,
            c,
          );
        r.rows.forEach((x, i) =>
          assert.ok(Math.abs(x.equity - v.rows[i].equity) < 1e-8),
        );
      });
      test("prefix causality", () => {
        const r = run(a, f, s, c),
          q = run(a.slice(0, 420), f, s, c);
        assert.deepEqual(r.rows.slice(0, 259), q.rows.slice(0, -1));
      });
    }
// Entry immediately pays fee and changing this close cannot change the open decision or fill.
test("today close unavailable at open", () => {
  const r = run(a),
    b = a.map((v, i) => (i === 300 ? { ...v, close: v.close * 4 } : v)),
    q = run(b);
  assert.equal(r.rows[140].target, q.rows[140].target);
  assert.deepEqual(
    r.fills.filter((x) => x.index === 300 && x.phase === "open"),
    q.fills.filter((x) => x.index === 300 && x.phase === "open"),
  );
});

// Guard invalid settings and bounded price inputs whose compounded ledger is not supported.
for (const [f, s, c] of [
  [11, 100, 5],
  [20, 61, 5],
  [20, 100, 6],
]) {
  test("unsupported settings", () =>
    assert.throws(() => run(generate(), f, s, c)));
}
const evil = generate();
for (const b of evil) b.open = 1000000;
for (const t of run(generate(), 20, 100, 0).fills)
  if (t.side === "BUY") evil[t.index].open = 0.01;
test("wealth guard", () =>
  assert.throws(() => run(evil, 20, 100, 0), /Wealth/));
for (const size of [200, 2000]) {
  const a = generate(1, size);
  test("boundary row count", () => {
    assert.equal(parseCSV(csv(a)).length, size);
    assert.equal(run(a).rows.length, size - 160);
  });
}
for (const price of [0.01, 100.1, 1000000]) {
  const a = generate(0, 200).map((b) => ({ ...b, open: price, close: price }));
  test("flat prices tie", () => assert.equal(run(a).fills.length, 0));
}
console.log(`${n} parser/metamorphic/boundary fixtures passed`);
