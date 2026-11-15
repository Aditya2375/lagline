# Numerical contract

## One clock, no same-bar shortcut

Bars are supplied in strictly increasing date order. Each row is assumed to be one complete daily session with an open followed by a close. No exchange calendar, missing-session inference, timezone conversion, split adjustment or data cleaning is performed. Dates alone cannot establish these properties. Open and close must use the same units and corporate-action adjustment. No external market data is included.

For execution bar i, F = sum(close[j], j=i-fast..i-1)/fast and S = sum(close[j], j=i-slow..i-1)/slow. Fast is 10, 20 or 40; slow is 60, 100 or 160 observations. Target long iff F-S > 1e-12*max(F,S), otherwise cash. This relative tolerance treats numerical near-equality as a tie. The window includes the prior close and excludes the execution bar entirely. All settings begin at index160 (row161); the first160 bars are warmup. Initial state is cash10,000, shares0. The first target is entered even if the crossing happened during warmup. This is a maintained long/cash state, not an entry only on a newly observed cross.

The price chart deliberately plots current-close SMAs; they can only inform the next bar. The inspector shows the actual prior-close SMAs used for the selected opening execution. No current open, close or future observation enters that target. Changed later prices cannot alter earlier opening fills or marked states. A shortened test has a different predeclared terminal exit; prefix tests exclude its final bar.

## Cash and units, not shifted close-to-close returns

c = basis points/10,000 for c in {0, .0005, .002}. This is a charge on executed notional, not a calibrated estimate of brokerage, spread or slippage.

- Cash to long at open P: q = cash/[P*(1+c)]; charge = q*P*c; cash becomes0.
- Long to cash at open P: cash = q*P*(1-c); charge = q*P*c; shares become0.
- An unchanged long target keeps the same shares, without daily rebalancing or fees. An unchanged cash target does nothing.
- At each close: equity = cash + shares*close. Cash earns zero. Fractional shares, full immediate fills, no leverage or shorting.
- At the final supplied close, any remaining shares are liquidated at that close, paying the same charge. This finite-horizon exit is declared before the run; it is not a signal-generated trade. A final-bar open entry can therefore be followed by a final-close sale. The final close's new signal has no later bar and is discarded.

Buy-and-hold uses the same initial10,000, buys at the same first eligible open (including entry charge), retains its shares and sells at the same final close (including exit charge). At nonterminal closes it is marked, not sold. Benchmark charges shown are cumulative amounts actually paid so far; the exit charge appears only at the terminal bar.

A next-open entry does not earn the preceding close-to-open gap. Existing shares do experience that gap. No position-return shortcut is used: every fill changes the cash/units ledger at its execution price.

## Summaries and precision

Net total return = finalcash/10,000 - 1. Relative result is a difference in percentage points, not a ratio or alpha estimate. Maximum drawdown = min(equity_t/max(10,000, equity_160..equity_t)-1), computed from close marks including final liquidation and initialcash. It misses intraday drawdowns. Strategy charges are the sum of actual entry/exit notional charges in starting currency units; they are not the total performance impact of costs. Completed round trips = number of strategy fills/2; final liquidation closes any remaining position. No annualized return, volatility, Sharpe ratio or predictive inference is reported.

Double precision is used, with no intermediate rounding. Inspector/ledger values show six decimals, summary amounts two, percentages two. Displayed tiny percentages can round to zero; large summaries use compact/scientific notation. The six-decimal displayed SMAs can look equal even when the unrounded comparison is decisive. Wealth outside [1e-12,1e12] units is rejected to prevent unsupported overflow/underflow and extreme output. The parser is not a financial-data quality check.

## Engineered controls

720 weekdays starting2020-01-01, no holiday calendar. Start previousclose p=100. For zero-based i:

- Slow waves: overnight g=.001*sin(.73i); intraday h=.0017*sin(i/75)+.00025+.002*sin(.31i).
- Short reversals: g=.001*sin(.73i); h=.006*sin(.25i)+.001*sin(.91i).
- Opening gaps: g=.075 when i mod80=0, -.065 when i mod80=40, otherwise0; h=.001*sin(i/45)-.65g.
- open=p*exp(g); close=open*exp(h); update p=close.

These smooth deterministic controls were engineered to expose mechanics. They are not calibrated market processes, historical evidence, forecasts, or independent tests of strategy profitability. No best setting is selected. Changing settings after seeing a curve can overfit; there is no out-of-sample or multiple-testing claim.

## Local input and privacy

Exact header date,open,close. Optional UTF-8 BOM and CRLF/LF; outer file whitespace/trailing newlines trimmed. Three unquoted fields per nonblank row. Plain decimal prices only (no exponents, signs, percentages, thousands separators, formulas or extra columns), bounded[.01,1,000,000]. Row count200..2000. Real ISO dates1900..2099, strictly increasing, no duplicates. Maximum200,000bytes checked against native File.size before reading and UTF-8 byte length before parsing. Parsing and a full guarded candidate run succeed before replacing the active dataset. Invalid replacement or unsupported setting preserves the previous state. Reset or source selection invalidates pending reads using a generation counter.

Local content stays in page memory: no upload, storage, analytics, filename display or local-data export. The example download is always freshly generated Opening gaps data, even after importing a local CSV. Reset removes this page's active reference, not secure erasure of browser/device memory. Extensions, compromised devices and the site's server are outside this model's guarantees.

## Limits and references

Exact open/close fills, fractional units and no liquidity cap are teaching assumptions. No spread, impact, slippage model, taxes, funding, dividends, corporate-action processing, missed fills or latency. Positive prices exclude bankruptcies/zero marks; daily close drawdown omits intraday risk. A causal engine does not fix survivorship bias, revised/adjusted-data errors, selection effects or overfitting. Cost settings are not claims of realism or conservatism.

- [Backtrader execution documentation](https://www.backtrader.com/docu/order-creation-execution/order-creation-execution/): current bar has already happened; next-bar opening market-fill convention. This application does not depend on Backtrader.
- [Fidelity SMA definition](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/sma): arithmetic mean over the chosen observations.
- [SEC investor bulletin, Performance Claims](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-47): hypothetical results, costs and comparable benchmarks.
- [Bailey et al., The Probability of Backtest Overfitting,2015](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf): repeated selection can overfit. No PBO calculation is implemented here.
- [CFA Institute commentary,2014](https://rpc.cfainstitute.org/blogs/enterprising-investor/2014/does-selling-theoretical-performance-put-investors-first): hindsight and missing implementation costs.

Original implementations and generated controls. No source code, papers, market datasets, logos, fonts or figures from these sources are redistributed.
