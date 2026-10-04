// Loads the app's TypeScript model so every number in the paper comes from the
// code the simulator runs. The sources are transpiled, not reimplemented.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(ROOT, "paper/.cache/model");
mkdirSync(out, { recursive: true });

for (const name of ["catalog", "network", "comparison", "chat-types"]) {
  const source = readFileSync(join(ROOT, "lib/starcloud", `${name}.ts`), "utf8");
  const js = ts
    .transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace(/from "\.\/([\w-]+)"/g, 'from "./$1.mjs"');
  writeFileSync(join(out, `${name}.mjs`), js);
}

const load = (name) => import(pathToFileURL(join(out, `${name}.mjs`)).href);
export const catalog = await load("catalog");
export const network = await load("network");
export const comparison = await load("comparison");
