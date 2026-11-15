package lagline;

import java.time.LocalDate;
import java.util.*;

/** Original, deterministic single-asset accounting model. No market connection. */
public final class Engine {
  public record Bar(String date, double open, double close) {}

  public record Row(
      int index,
      double fast,
      double slow,
      int target,
      int action,
      double shares,
      double cash,
      double equity,
      double benchmark,
      double fee,
      double fees,
      double benchmarkFees,
      double drawdown,
      boolean terminal) {}

  public record Fill(
      int index,
      String side,
      String phase,
      double price,
      double quantity,
      double fee,
      double cash,
      double shares) {}

  public record Result(
      List<Row> rows, List<Fill> fills, double maxDrawdown, double benchmarkMaxDrawdown) {}

  public static List<Bar> generate(int kind, int count) {
    if (kind < 0 || kind > 2 || count < 200 || count > 2000)
      throw new IllegalArgumentException("control/count");
    List<Bar> a = new ArrayList<>();
    LocalDate d = LocalDate.of(2020, 1, 1);
    double p = 100;
    for (int i = 0; i < count; i++) {
      while (d.getDayOfWeek().getValue() > 5) d = d.plusDays(1);
      double overnight =
          kind == 2
              ? ((i % 80 == 0) ? .075 : ((i % 80 == 40) ? -.065 : 0))
              : .001 * Math.sin(i * .73);
      double intraday =
          kind == 0
              ? .0017 * Math.sin(i / 75.0) + .00025 + .002 * Math.sin(i * .31)
              : kind == 1
                  ? .006 * Math.sin(i * .25) + .001 * Math.sin(i * .91)
                  : .001 * Math.sin(i / 45.0) - overnight * .65;
      double o = p * Math.exp(overnight);
      p = o * Math.exp(intraday);
      a.add(new Bar(d.toString(), o, p));
      d = d.plusDays(1);
    }
    return a;
  }

  public static void validate(List<Bar> a) {
    if (a == null || a.size() < 200 || a.size() > 2000)
      throw new IllegalArgumentException("200..2000 bars");
    String prev = "";
    for (Bar b : a) {
      if (b == null
          || b.date() == null
          || !b.date().matches("(?:19|20)\\d{2}-\\d{2}-\\d{2}")
          || !LocalDate.parse(b.date()).toString().equals(b.date())
          || b.date().compareTo(prev) <= 0) throw new IllegalArgumentException("dates");
      if (!Double.isFinite(b.open())
          || !Double.isFinite(b.close())
          || b.open() < .01
          || b.close() < .01
          || b.open() > 1e6
          || b.close() > 1e6) throw new IllegalArgumentException("prices");
      prev = b.date();
    }
  }

  public static Result run(List<Bar> a, int fast, int slow, int bps) {
    validate(a);
    if (!(fast == 10 || fast == 20 || fast == 40)
        || !(slow == 60 || slow == 100 || slow == 160)
        || !(bps == 0 || bps == 5 || bps == 20)) throw new IllegalArgumentException("settings");
    double fee = bps / 10000.0,
        cash = 10000,
        shares = 0,
        fees = 0,
        bs = 0,
        bf = 0,
        bc = 0,
        peak = 10000,
        bpeak = 10000,
        mdd = 0,
        bmdd = 0;
    List<Row> rows = new ArrayList<>();
    List<Fill> fills = new ArrayList<>();
    for (int i = 160; i < a.size(); i++) {
      double f = 0, s = 0;
      for (int j = i - fast; j < i; j++) f += a.get(j).close();
      for (int j = i - slow; j < i; j++) s += a.get(j).close();
      f /= fast;
      s /= slow;
      int target = f - s > 1e-12 * Math.max(f, s) ? 1 : 0, action = shares > 0 ? 1 : 0;
      double paid = 0;
      Bar b = a.get(i);
      if (i == 160) {
        bs = 10000 / (b.open() * (1 + fee));
        bf = bs * b.open() * fee;
      }
      if (target == 1 && shares == 0) {
        shares = cash / (b.open() * (1 + fee));
        paid = shares * b.open() * fee;
        cash = 0;
        action = 2;
        fills.add(new Fill(i, "BUY", "open", b.open(), shares, paid, cash, shares));
      } else if (target == 0 && shares > 0) {
        double q = shares;
        paid = q * b.open() * fee;
        cash = q * b.open() - paid;
        shares = 0;
        action = 3;
        fills.add(new Fill(i, "SELL", "open", b.open(), q, paid, cash, shares));
      }
      boolean terminal = i == a.size() - 1;
      if (terminal) {
        bc = bs * b.close() * (1 - fee);
        bf += bs * b.close() * fee;
        bs = 0;
        if (shares > 0) {
          double q = shares, fc = q * b.close() * fee;
          paid += fc;
          cash = q * b.close() - fc;
          shares = 0;
          fills.add(new Fill(i, "SELL", "end close", b.close(), q, fc, cash, shares));
        }
      }
      fees += paid;
      double eq = cash + shares * b.close(), be = bc + bs * b.close();
      peak = Math.max(peak, eq);
      bpeak = Math.max(bpeak, be);
      double dd = eq / peak - 1;
      mdd = Math.min(mdd, dd);
      bmdd = Math.min(bmdd, be / bpeak - 1);
      if (!Double.isFinite(eq)
          || !Double.isFinite(be)
          || eq < 1e-12
          || be < 1e-12
          || eq > 1e12
          || be > 1e12)
        throw new IllegalArgumentException("Wealth outside supported 1e-12..1e12 units");
      rows.add(
          new Row(i, f, s, target, action, shares, cash, eq, be, paid, fees, bf, dd, terminal));
    }
    return new Result(rows, fills, mdd, bmdd);
  }
}
