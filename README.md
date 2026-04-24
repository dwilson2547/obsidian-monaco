# obsidian-monaco

An [Obsidian](https://obsidian.md) plugin that opens code files inside the full [Monaco Editor](https://microsoft.github.io/monaco-editor/) — the same editor that powers VS Code.

## Features

- **Syntax highlighting** for 60+ languages (TypeScript, Python, Rust, Go, SQL, …)
- **Full Monaco editing capabilities**: multi-cursor / multi-line editing, column selection, bracket-pair colouring, code folding, minimap, and more
- **Settings panel** to configure the editor appearance (theme, font size, word wrap, minimap)
- **Per-extension toggle**: enable or disable Monaco for any file type individually
- **Vault scanner**: click *Scan vault* to detect every file extension present in your vault and add them to the toggle list

## Installation

### Manual

1. Download `main.js`, `styles.css`, and `manifest.json` from the [latest release](../../releases/latest).
2. Copy the three files into `<VaultFolder>/.obsidian/plugins/obsidian-monaco/`.
3. Reload Obsidian and enable the plugin under **Settings → Community Plugins**.

## Usage

Once enabled, opening any file whose extension is toggled **on** in the plugin settings will display it in Monaco instead of the plain-text fallback.  Files are auto-saved after every edit (500 ms debounce).

### Settings

| Setting | Description |
|---------|-------------|
| Theme | `Light`, `Dark`, `High Contrast Dark`, `High Contrast Light` |
| Font size | 10 – 32 px |
| Word wrap | `Off`, `On`, `At wrap column`, `Bounded` |
| Minimap | Show / hide the minimap overview rail |
| Scan vault | Discover all file extensions in the vault |
| Enabled extensions | Per-extension toggle |

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

## License

MIT