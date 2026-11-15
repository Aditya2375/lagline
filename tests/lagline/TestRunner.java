package lagline;

import java.util.*;

public class TestRunner {
  static int checks = 0;

  static void ok(boolean v) {
    checks++;
    if (!v) throw new AssertionError("check " + checks);
  }

  static void near(double a, double b) {
    ok(Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(b)));
  }

  public static void main(String[] args) {
    for (int k = 0; k < 3; k++)
      for (int f : new int[] {10, 20, 40})
        for (int s : new int[] {60, 100, 160})
          for (int c : new int[] {0, 5, 20}) {
            var a = Engine.generate(k, 720);
            var r = Engine.run(a, f, s, c);
            ok(r.rows().size() == 560);
            double prev = 0;
            for (var row : r.rows()) {
              ok(row.equity() > 0 && Double.isFinite(row.equity()));
              ok(row.shares() >= 0 && row.cash() >= 0);
              ok(row.fees() >= prev);
              prev = row.fees();
              double mean = 0;
              for (int j = row.index() - f; j < row.index(); j++) mean += a.get(j).close();
              near(row.fast(), mean / f);
            }
            ok(r.rows().get(559).shares() == 0);
            ok(r.fills().size() % 2 == 0);
            for (var t : r.fills()) near(t.fee(), t.price() * t.quantity() * c / 10000.0);
            // A changed future cannot affect any earlier full state, including target and cash.
            var b = new ArrayList<>(a);
            for (int j = 450; j < b.size(); j++) {
              var v = b.get(j);
              b.set(j, new Engine.Bar(v.date(), v.open() * 1.2, v.close() * .9));
            }
            var q = Engine.run(b, f, s, c);
            for (int j = 0; j < 290; j++) ok(r.rows().get(j).equals(q.rows().get(j)));
          }
    var a = Engine.generate(0, 200);
    var flat = new ArrayList<Engine.Bar>();
    for (var b : a) flat.add(new Engine.Bar(b.date(), 100, 100));
    for (int c : new int[] {0, 5, 20}) {
      var r = Engine.run(flat, 20, 100, c);
      for (var row : r.rows()) {
        ok(row.target() == 0);
        near(row.equity(), 10000);
      }
      double z = c / 10000.0;
      near(r.rows().get(39).benchmark(), 10000 * (1 - z) / (1 + z));
      ok(r.fills().isEmpty());
    }
    // Monotone closes, first eligible open gapped sharply: no earlier close fill.
    var trend = new ArrayList<Engine.Bar>();
    for (int i = 0; i < 200; i++)
      trend.add(new Engine.Bar(a.get(i).date(), i == 160 ? 500 : 100 + i, 100 + i));
    var r = Engine.run(trend, 10, 60, 20);
    var t = r.fills().get(0);
    ok(t.index() == 160 && t.price() == 500);
    near(t.quantity(), 10000 / (500 * 1.002));
    near(t.quantity() * 500 + t.fee(), 10000);
    var end = r.fills().get(1);
    ok(end.phase().equals("end close"));
    near(r.rows().get(39).cash(), t.quantity() * 299 * .998);
    ok(r.rows().get(39).target() == 1 && r.rows().get(39).shares() == 0);
    boolean bad = false;
    try {
      Engine.run(a, 11, 100, 5);
    } catch (IllegalArgumentException ex) {
      bad = true;
    }
    ok(bad);
    System.out.println(checks + " Java checks passed");
  }
}
