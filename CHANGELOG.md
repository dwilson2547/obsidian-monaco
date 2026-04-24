# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Monaco-based editing for supported non-Markdown file types inside Obsidian.
- A collapsible bottom console that runs commands from the currently opened file's folder.
- Editor appearance settings for theme, font size, word wrap, and minimap visibility.
- Per-extension routing so Monaco can be enabled or disabled for individual file types.
- A vault scanner that discovers extensions present in the current vault and adds them to the settings list.
- Auto-save for Monaco-edited files with a short debounce.
- Documentation covering installation, usage, settings, development, and recent changes.

### Changed

- Plugin setup now restores original Obsidian file-type handlers when the plugin unloads.
- CSS build output is merged into `styles.css` so the plugin continues to use Obsidian's standard stylesheet loading flow.

### Fixed

- Paste support for Monaco editors in Obsidian desktop, including `Ctrl/Cmd + V` and context-menu paste.
- Missing Monaco `productService` registration that caused paste commands to fail at runtime.
- Clipboard handling by adding a document-level fallback and Electron clipboard path for desktop use.

## [1.0.0]

### Added

- Initial release of the Obsidian Monaco plugin.
