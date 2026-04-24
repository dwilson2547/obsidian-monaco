# obsidian-monaco

An [Obsidian](https://obsidian.md) plugin that opens code files inside the full [Monaco Editor](https://microsoft.github.io/monaco-editor/) — the same editor that powers VS Code.

## Features

- **Syntax highlighting** for 60+ languages (TypeScript, Python, Rust, Go, SQL, …)
- **Full Monaco editing capabilities**: multi-cursor / multi-line editing, column selection, bracket-pair colouring, code folding, minimap, and more
- **Collapsible bottom console** to run commands from the current file's folder without leaving Obsidian
- **Settings panel** to configure the editor appearance (theme, font size, word wrap, minimap)
- **Per-extension toggle**: enable or disable Monaco for any file type individually
- **Vault scanner**: click *Scan vault* to detect every file extension present in your vault and add them to the toggle list
- **Desktop paste support** for keyboard paste and context-menu paste inside Monaco

## Recent updates

- Added a bottom console for running commands in the current file's directory.
- Added settings for theme, font size, word wrap, minimap, and per-extension routing.
- Added vault extension scanning so supported file types can be discovered from the active vault.
- Fixed Monaco paste handling in Obsidian desktop by registering the missing Monaco service and adding desktop clipboard fallbacks.
- Added a project changelog in [`CHANGELOG.md`](./CHANGELOG.md).

## Installation

### Manual

1. Download `main.js`, `styles.css`, and `manifest.json` from the [latest release](../../releases/latest).
2. Copy the three files into `<VaultFolder>/.obsidian/plugins/obsidian-monaco/`.
3. Reload Obsidian and enable the plugin under **Settings → Community Plugins**.

## What the plugin does

When enabled, the plugin reroutes selected non-Markdown file extensions to a Monaco-powered Obsidian view. It preserves Obsidian's original file association for extensions that are not enabled and restores those associations when the plugin unloads.

## Usage

Once enabled, opening any file whose extension is toggled **on** in the plugin settings will display it in Monaco instead of the plain-text fallback. Files are auto-saved after every edit with a 500 ms debounce.

Use the **Show console** button at the bottom of the editor to open the built-in command console for the current file's folder.

### Clipboard and paste behavior

- **Ctrl/Cmd + V** is supported in the Monaco editor.
- **Context-menu paste** is supported in the Monaco editor.
- The plugin includes desktop-specific clipboard fallbacks because Obsidian runs Monaco inside an Electron environment.

### Settings

| Setting | Description |
|---------|-------------|
| Theme | `Light`, `Dark`, `High Contrast Dark`, `High Contrast Light` |
| Font size | 10 – 32 px |
| Word wrap | `Off`, `On`, `At wrap column`, `Bounded` |
| Minimap | Show / hide the minimap overview rail |
| Scan vault | Discover all file extensions in the vault |
| Enabled extensions | Per-extension toggle |

### Console

- The console runs commands relative to the folder of the currently open file.
- Console output is shown inline at the bottom of the editor.
- If a command stays active, the input switches into send-input mode so you can interact with the running process.

### Multi-cursor editing

- **Alt + Click** to place additional cursors (mirrors VS Code default)
- **Ctrl/Cmd + D** to select the next occurrence of the current word
- **Ctrl/Cmd + Alt + ↑/↓** to add a cursor above/below

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

The built plugin files are `main.js`, `styles.css`, and `manifest.json`.

See [`CHANGELOG.md`](./CHANGELOG.md) for a running history of project updates.

## License

MIT
