import { mkdirSync, copyFileSync, rmSync } from "node:fs";
rmSync("docs", { force: true, recursive: true });
mkdirSync("docs/src", { recursive: true });
for (const p of ["index.html", "styles.css"]) copyFileSync(p, `docs/${p}`);
for (const p of ["app.js", "model.js"])
  copyFileSync(`web/src/${p}`, `docs/src/${p}`);
