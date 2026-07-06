// Pre-compiles frontend/pkg/listen/*.jsx into a single plain-JS bundle so the
// browser never has to download babel.js (2.4MB) and JIT-transpile 8 files on
// every page load. Runs automatically before `npm start` (see package.json).
import { transformSync } from "@babel/core";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const listenDir = join(here, "frontend/pkg/listen");

const files = [
  "data.jsx",
  "store.jsx",
  "widgets.jsx",
  "features.jsx",
  "features2.jsx",
  "views.jsx",
  "views3.jsx",
  "app.jsx",
];

const compiled = files.map((name) => {
  const src = readFileSync(join(listenDir, name), "utf8");
  const { code } = transformSync(src, {
    filename: name,
    presets: [["@babel/preset-react", { runtime: "classic" }]],
  });
  return `// ---- ${name} ----\n${code}`;
});

writeFileSync(join(listenDir, "bundle.js"), compiled.join("\n\n"));
console.log(`[build-frontend] wrote listen/bundle.js from ${files.length} files`);
