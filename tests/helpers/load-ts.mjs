import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { fileURLToPath } from "node:url";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export function load(entry, overrides = {}, cache = new Map()) {
  const filename = path.resolve(root, entry);
  if (cache.has(filename)) return cache.get(filename);
  const loaded = { exports: {} };
  cache.set(filename, loaded.exports);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const resolve = (specifier) => {
    if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
    if (specifier === "server-only") return {};
    const target = specifier.startsWith("@/")
      ? path.join(root, "src", specifier.slice(2))
      : path.resolve(path.dirname(filename), specifier);
    return load(
      path.relative(
        root,
        target + (fs.existsSync(target + ".tsx") ? ".tsx" : ".ts"),
      ),
      overrides,
      cache,
    );
  };
  vm.runInNewContext("(function(require,module,exports){" + code + "\n})", {
    setTimeout,
    clearTimeout,
    FormData,
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    Intl,
    AbortSignal,
    Response,
    fetch,
    process: { env: overrides.__env || {} },
  })(resolve, loaded, loaded.exports);
  cache.set(filename, loaded.exports);
  return loaded.exports;
}
