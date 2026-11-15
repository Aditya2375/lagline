# lagline

A Java-first moving-average backtest with an explicit information clock. Prior-close SMA signals execute at the next supplied open. A cash-and-shares ledger accounts for each fill and charge, including a predeclared final liquidation. Buy-and-hold uses the same interval and costs.

Three original generated price controls, adjustable SMA windows and per-side charges, paired price/wealth charts, an execution-date inspector and every strategy fill. Optional local daily open/close CSV stays in page memory. No feeds, accounts, trades or recommendations.

This is a mechanics lab, not a historical performance claim. Smooth generated controls do not establish an edge. Prices, liquidity, corporate actions and costs in real markets differ from this model. Read [the numerical contract](NUMERICS.md) before comparing results.

## Run locally

Java21+, Node22+, Python3.10+; browser smoke also needs Google Chrome (`google-chrome` on PATH). No application dependencies or runtime downloads.

```sh
javac -d build/classes src/lagline/*.java tools/*.java tests/lagline/*.java
java -cp build/classes lagline.TestRunner
node tests/parity.mjs
node tests/parser.mjs
python3 tests/reference.py
node tools/build-web.mjs
node tests/browser-smoke.mjs
python3 -m http.server 8000 --directory docs
```

Open http://localhost:8000. `JAVA=/path/to/java node tests/parity.mjs` selects a custom Java executable. `SMOKE_SHOTS=1 node tests/browser-smoke.mjs` writes local screenshots. The smoke runner uses local ports8969/9370 and stops both child processes when done.

## Data format

Exact header `date,open,close`, then200-2,000 increasing real ISO dates and positive decimal open/close prices. Maximum200,000bytes. No exponent, quoted fields, separators or formulas. Use coherent units and corporate-action adjustments. No upload or storage; reset drops this page's active reference, not secure erasure. The example download always contains freshly generated prices, never imported data.

## Model boundaries

Long or cash, fractional shares, no leverage; first160bars warm up all settings. A per-side notional charge, zero cash interest, same first-open/final-close benchmark. No spreads, impact, partial fills, taxes, dividends, intraday risk or corporate-action processing. Close-based drawdown includes initialcash. No annualization or best-setting search. Native Safari is not tested; Chrome desktop and emulated mobile are tested.

## License

Original code, documentation and generated controls are available under **MIT OR Apache-2.0**, at your option. See [LICENSE-MIT](LICENSE-MIT) and [LICENSE-APACHE](LICENSE-APACHE). No third-party runtime assets or market data are included. References are linked in NUMERICS.md, not redistributed.
