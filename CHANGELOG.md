# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Monaco-based editing for supported non-Markdown file types inside Obsidian.
- A collapsible bottom integrated terminal powered by xterm.js and node-pty.
- Editor appearance settings for theme, font size, word wrap, and minimap visibility.
- Per-extension routing so Monaco can be enabled or disabled for individual file types.
- A vault scanner that discovers extensions present in the current vault and adds them to the settings list.
- Auto-save for Monaco-edited files with a short debounce.
- Documentation covering installation, usage, settings, development, and recent changes.
- Terminal shell profile settings for automatic shell selection, PowerShell, Command Prompt, Git Bash, bash, zsh, sh, and a custom shell path.
- Bundled `vendor/node-pty` runtime files so the integrated terminal can run from installed plugin builds.
- A command palette action to open a new blank Monaco editor tab that users can bind to a hotkey.

### Changed

- Plugin setup now restores original Obsidian file-type handlers when the plugin unloads.
- CSS build output is merged into `styles.css` so the plugin continues to use Obsidian's standard stylesheet loading flow.
- Manual installation now requires copying the generated `vendor/` directory alongside `main.js`, `styles.css`, and `manifest.json`.
- The integrated terminal panel can now be resized vertically with a draggable divider instead of using a fixed height.

### Fixed

- Paste support for Monaco editors in Obsidian desktop, including `Ctrl/Cmd + V` and context-menu paste.
- Missing Monaco `productService` registration that caused paste commands to fail at runtime.
- Clipboard handling by adding a document-level fallback and Electron clipboard path for desktop use.
- Terminal runtime loading in Obsidian desktop by resolving `node-pty` from the installed plugin directory instead of Electron's renderer path.
- Windows terminal startup in Obsidian by forcing the winpty path and patching the bundled node-pty runtime to avoid unsupported worker construction.
- Terminal viewport sizing so the xterm instance now fills the resized panel correctly.
- Terminal resizing edge cases by enforcing a 100 px minimum expanded terminal height.

## [1.0.0]

### Added

- Initial release of the Obsidian Monaco plugin.
