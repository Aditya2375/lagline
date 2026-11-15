import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { generate, run } from "../web/src/model.js";
const java = process.env.JAVA || "java";
let count = 0,
  max = 0;
for (const k of [0, 1, 2])
  for (const f of [10, 20, 40])
    for (const s of [60, 100, 160])
      for (const c of [0, 5, 20]) {
        const expected = execFileSync(
          java,
          ["-cp", "build/classes", "Dump", k, f, s, c].map(String),
          { maxBuffer: 5e6 },
        )
          .toString()
          .trim()
          .split("\n")
          .map((x) => x.split(",").map(Number));
        const actual = run(generate(k), f, s, c).rows;
        assert.equal(actual.length, expected.length);
        actual.forEach((r, i) => {
          [
            r.index,
            r.fast,
            r.slow,
            r.target,
            r.action,
            r.shares,
            r.cash,
            r.equity,
            r.benchmark,
            r.fee,
            r.fees,
            r.benchmarkFees,
            r.drawdown,
            +r.terminal,
          ].forEach((v, j) => {
            const e =
              Math.abs(v - expected[i][j]) /
              Math.max(1, Math.abs(expected[i][j]));
            max = Math.max(max, e);
            assert.ok(e < 2e-10, `${k}/${f}/${s}/${c} row${i} col${j} ${e}`);
            count++;
          });
        });
      }
console.log(`${count} Java/JS comparisons, max normalized error ${max}`);
