import { generate, run } from "../web/src/model.js";
const cases = [];
for (const kind of [0, 1, 2])
  for (const fast of [10, 20, 40])
    for (const slow of [60, 100, 160])
      for (const bps of [0, 5, 20]) {
        const bars = generate(kind);
        cases.push({ bars, fast, slow, bps, ...run(bars, fast, slow, bps) });
      }
console.log(JSON.stringify(cases));
