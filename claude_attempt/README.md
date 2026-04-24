# Obsidian Monaco Code Editor

View and edit code files inside Obsidian using **Monaco Editor** — the same editor engine that powers VS Code — with full syntax highlighting, bracket pair coloring, folding, and a minimap.

---

## Features

| Feature | Detail |
|---|---|
| Syntax highlighting | ~80 languages via Monaco's built-in Monarch tokenizers |
| Read-only toggle | Per-file toggle in the toolbar; settable as default |
| Dirty tracking | "● unsaved changes" indicator + Ctrl/Cmd+S to save |
| Theme sync | Follows Obsidian's light/dark theme automatically (or pick manually) |
| Minimap | Scrollable code overview, toggleable |
| Bracket pair colorization | On by default |
| Font size / word wrap | Configurable per settings |
| Handled extensions | Full list editable in settings, hot-reloaded |

---

## Setup

```bash
# 1. Install deps
npm install

# 2. Dev mode (watch + rebuild on save)
npm run dev

# 3. Production build (minified, no sourcemaps)
npm run build
```

Copy `main.js` and `manifest.json` into your vault's plugin folder:

```
<vault>/.obsidian/plugins/monaco-code-editor/
├── main.js
└── manifest.json
```

Enable the plugin in **Settings → Community Plugins**.

---

## Architecture Notes

### Why workers are disabled

Monaco uses web workers for heavy language features (diagnostics, rename, go-to-definition). These require a separate JS file served from the same origin, which is awkward in a bundled Obsidian plugin with no dev server.

**Syntax highlighting** (`MonarchTokenizer` / `TextMate`) runs on the main thread — workers aren't involved. Since this plugin targets viewing + editing code (not full LSP), disabling workers costs nothing you'd notice.

The no-op worker shim:
```ts
window.MonacoEnvironment = {
  getWorker(_id, _label) {
    const blob = new Blob([""], { type: "application/javascript" });
    return new Worker(URL.createObjectURL(blob));
  },
};
```

If you later want diagnostics for TypeScript/JSON/CSS (the three languages Monaco ships full workers for), you can bundle the worker files separately and serve them via a custom URI protocol — out of scope here.

### Bundle size

`monaco-editor` is large (~3–5 MB minified). For a local plugin this is fine, but if you want to trim it:
- Import only specific language tokenizers from `monaco-editor/esm/vs/...`
- Use `monaco-editor/esm/vs/editor/editor.api` as the entry instead of the default barrel

### CSS injection

Monaco ships its own CSS (editor chrome, scrollbars, bracket colors, etc.). The esbuild plugin in `esbuild.config.mjs` intercepts those CSS imports and emits JS that injects them as a `<style data-monaco-css>` tag once on first load, rather than requiring a separate `.css` output file.

### FileView vs ItemView

The plugin uses Obsidian's `FileView` (not the lower-level `ItemView`), which gives:
- `onLoadFile(file)` / `onUnloadFile(file)` lifecycle hooks
- `canAcceptExtension(ext)` for routing
- Automatic header updates via `this.leaf.updateHeader()`

### registerExtensions caveat

`Plugin.registerExtensions()` tells Obsidian to route those file types to your view globally. If another plugin also claims an extension, whichever loaded last wins. Avoid registering `md` — it will conflict with the core Markdown view.

---

## Extending

**Add a language:** add the extension → Monaco language ID entry to `LANG_MAP` in `main.ts`. Monaco's built-in language list: https://code.visualstudio.com/docs/languages/identifiers

**Custom keybindings:** use `this.editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.F, ...)` after `buildEditor()`.

**IntelliSense for TypeScript/JSON:** bundle the Monaco TS worker and register it via `MonacoEnvironment.getWorker` — return the real worker when `label === "typescript"` or `label === "json"`.
