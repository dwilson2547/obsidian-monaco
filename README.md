# obsidian-monaco

An [Obsidian](https://obsidian.md) plugin that opens code files inside the full [Monaco Editor](https://microsoft.github.io/monaco-editor/) — the same editor that powers VS Code.

## Features

- **Syntax highlighting** for 60+ languages (TypeScript, Python, Rust, Go, SQL, …)
- **Full Monaco editing capabilities**: multi-cursor / multi-line editing, column selection, bracket-pair colouring, code folding, minimap, and more
- **Collapsible, resizable bottom terminal** powered by xterm.js and node-pty, starting in the current file's folder
- **Settings panel** to configure editor appearance plus the integrated terminal shell profile
- **Command palette action** to open a new scratch Monaco editor tab, with optional user-assigned hotkey support
- **Per-extension toggle**: enable or disable Monaco for any file type individually
- **Vault scanner**: click *Scan vault* to detect every file extension present in your vault and add them to the toggle list
- **Desktop paste support** for keyboard paste and context-menu paste inside Monaco

## Recent updates

- Replaced the bottom command console with a real integrated terminal powered by xterm.js and node-pty.
- Made the integrated terminal vertically resizable with a draggable divider and a 100 px minimum expanded height.
- Added terminal shell profile settings, including PowerShell, cmd, Git Bash, bash, zsh, sh, and a custom shell path.
- Added settings for theme, font size, word wrap, minimap, and per-extension routing.
- Added vault extension scanning so supported file types can be discovered from the active vault.
- Fixed Monaco paste handling in Obsidian desktop by registering the missing Monaco service and adding desktop clipboard fallbacks.
- Added a project changelog in [`CHANGELOG.md`](./CHANGELOG.md).

## Installation

### Manual

1. Download the full release contents from the [latest release](../../releases/latest).
2. Copy `main.js`, `styles.css`, `manifest.json`, and the `vendor/` folder into `<VaultFolder>/.obsidian/plugins/obsidian-monaco/`.
3. Reload Obsidian and enable the plugin under **Settings → Community Plugins**.

## What the plugin does

When enabled, the plugin reroutes selected non-Markdown file extensions to a Monaco-powered Obsidian view. It preserves Obsidian's original file association for extensions that are not enabled and restores those associations when the plugin unloads.

## Usage

Once enabled, opening any file whose extension is toggled **on** in the plugin settings will display it in Monaco instead of the plain-text fallback. Files are auto-saved after every edit with a 500 ms debounce.

Use the **Show terminal** button at the bottom of the editor to open the integrated terminal for the current file's folder. When open, drag the divider above the terminal to resize its height.

Use the **Open new editor tab** command from the command palette to open a blank Monaco scratch tab. You can also assign your own hotkey to that command in Obsidian's hotkey settings.

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
| Shell profile | `Automatic`, `PowerShell`, `Command Prompt`, `Git Bash`, `bash`, `zsh`, `sh`, `Custom path` |
| Custom shell path / arguments | Used when the shell profile is set to `Custom path` |
| Scan vault | Discover all file extensions in the vault |
| Enabled extensions | Per-extension toggle |

### Integrated terminal

- The terminal starts in the folder of the currently open file.
- The terminal panel can be resized with the mouse and has a minimum expanded height of 100 px.
- Shell input, ANSI colors, interactive prompts, and terminal resizing are handled by xterm.js and node-pty.
- Switching files in the same Monaco tab restarts the terminal in the new file's folder.
- On Windows, the shell profile can target PowerShell, Command Prompt, Git Bash, or a custom executable.
- The bundled `vendor/node-pty/` runtime is required for installed builds, including manual installs.
- On Windows, the terminal uses a winpty-compatible runtime path inside Obsidian so shells can start without worker-thread support.

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

The built plugin files are `main.js`, `styles.css`, `manifest.json`, and the generated `vendor/node-pty/` runtime files.

See [`CHANGELOG.md`](./CHANGELOG.md) for a running history of project updates.

## License

MIT
