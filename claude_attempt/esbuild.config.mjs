import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

// ── Monaco CSS injector plugin ────────────────────────────────────────────────
// Monaco imports its own CSS.  esbuild doesn't handle CSS-in-JS out of the box.
// This plugin captures CSS files imported from monaco-editor and injects them
// into the document as a <style> tag at runtime instead of emitting a .css file.
const monacoInjectCSSPlugin = {
  name: "monaco-css-inject",
  setup(build) {
    // Intercept CSS files that come from monaco-editor
    build.onLoad({ filter: /\.css$/, namespace: "file" }, async (args) => {
      const fs = await import("fs");
      const css = fs.readFileSync(args.path, "utf8");
      // Emit a JS module that injects the CSS on first import
      return {
        contents: `
          (function() {
            if (document.querySelector('style[data-monaco-css]')) return;
            const s = document.createElement('style');
            s.setAttribute('data-monaco-css', '1');
            s.textContent = ${JSON.stringify(css)};
            document.head.appendChild(s);
          })();
        `,
        loader: "js",
      };
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    // Obsidian ships these; don't double-bundle them
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "chrome114", // Obsidian 1.x ships Electron ~28, Chrome 114+
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  loader: {
    // Embed Monaco's font files as data URIs so they work without a server
    ".ttf": "dataurl",
    ".woff": "dataurl",
    ".woff2": "dataurl",
  },
  plugins: [monacoInjectCSSPlugin],
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
