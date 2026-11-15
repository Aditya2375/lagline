import lagline.Engine;

public class Dump {
  public static void main(String[] args) {
    int k = Integer.parseInt(args[0]),
        f = Integer.parseInt(args[1]),
        s = Integer.parseInt(args[2]),
        c = Integer.parseInt(args[3]);
    var a = Engine.generate(k, 720);
    var r = Engine.run(a, f, s, c);
    for (var v : r.rows())
      System.out.printf(
          java.util.Locale.ROOT,
          "%d,%.17g,%.17g,%d,%d,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%.17g,%d%n",
          v.index(),
          v.fast(),
          v.slow(),
          v.target(),
          v.action(),
          v.shares(),
          v.cash(),
          v.equity(),
          v.benchmark(),
          v.fee(),
          v.fees(),
          v.benchmarkFees(),
          v.drawdown(),
          v.terminal() ? 1 : 0);
  }
}
