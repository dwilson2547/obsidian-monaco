import {
  App,
  FileView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import * as monaco from "monaco-editor";

// ─────────────────────────────────────────────────────────────────────────────
// Language map: extension → Monaco language ID
// ─────────────────────────────────────────────────────────────────────────────

const LANG_MAP: Record<string, string> = {
  // Web
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "scss",
  less: "less",
  // Systems
  c: "c",
  h: "cpp",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  go: "go",
  rs: "rust",
  swift: "swift",
  // JVM
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  groovy: "java",
  // Scripting
  py: "python",
  rb: "ruby",
  lua: "lua",
  r: "r",
  pl: "perl",
  php: "php",
  // Shell
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  ps1: "powershell",
  psm1: "powershell",
  // Data / Config
  json: "json",
  jsonc: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  ini: "ini",
  conf: "ini",
  cfg: "ini",
  env: "shell",
  // Infra
  dockerfile: "dockerfile",
  tf: "hcl",
  hcl: "hcl",
  // Query / Schema
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  proto: "protobuf",
  // Markup
  xml: "xml",
  svg: "xml",
  // Other
  md: "markdown",
  mdx: "markdown",
  makefile: "makefile",
};

const DEFAULT_EXTENSIONS = Object.keys(LANG_MAP).filter((e) => e !== "md");

const VIEW_TYPE_MONACO = "monaco-code-editor";

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Key chord helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Keys that Obsidian claims globally but Monaco also wants.
 * We stop propagation for these in the capture phase so Obsidian never sees them
 * while the editor has focus.
 *
 * Format: { ctrl?, shift?, alt?, meta?, key } where `key` is KeyboardEvent.key
 */
const OBSIDIAN_CONFLICTS: Array<{
  ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean; key: string;
}> = [
  // Ctrl+Shift+L  →  Obsidian: Toggle left sidebar  /  Monaco: Select All Occurrences
  { ctrl: true, shift: true, key: "l" },
  // Ctrl+G        →  Obsidian: Open graph view       /  Monaco: Go to Line
  { ctrl: true, key: "g" },
  // Ctrl+Shift+K  →  Obsidian: Delete paragraph      /  Monaco: Delete Line
  { ctrl: true, shift: true, key: "k" },
  // Ctrl+Shift+M  →  Obsidian: Toggle right sidebar  /  Monaco: Toggle Problems panel
  { ctrl: true, shift: true, key: "m" },
  // Ctrl+Shift+\  →  Obsidian: Jump to matching bracket (CodeMirror) / Monaco also wants it
  { ctrl: true, shift: true, key: "\\" },
  // Ctrl+[  and  Ctrl+]  →  Obsidian note navigation / Monaco indent
  { ctrl: true, key: "[" },
  { ctrl: true, key: "]" },
];

function matchesConflict(
  e: KeyboardEvent,
  rule: (typeof OBSIDIAN_CONFLICTS)[number]
): boolean {
  const ctrlOrCmd = e.ctrlKey || e.metaKey;
  return (
    (!rule.ctrl  || ctrlOrCmd)  &&
    (!rule.shift || e.shiftKey) &&
    (!rule.alt   || e.altKey)   &&
    e.key.toLowerCase() === rule.key.toLowerCase()
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in shortcut reference (shown in settings)
// ─────────────────────────────────────────────────────────────────────────────

const BUILTIN_SHORTCUTS: Array<{ keys: string; description: string }> = [
  // ── Multi-cursor & selection ──────────────────────────────────────────────
  { keys: "Alt+Click",          description: "Add cursor at click position" },
  { keys: "Ctrl+Alt+↑ / ↓",    description: "Add cursor above / below" },
  { keys: "Ctrl+D",             description: "Select next occurrence of current word/selection" },
  { keys: "Ctrl+Shift+L",       description: "Select ALL occurrences (highlight all instances)" },
  { keys: "Ctrl+U",             description: "Undo last cursor operation" },
  { keys: "Shift+Alt+I",        description: "Add cursor to end of each selected line" },
  { keys: "Ctrl+Shift+Alt+↑/↓", description: "Column (box) selection up / down" },
  // ── Find & Replace ───────────────────────────────────────────────────────
  { keys: "Ctrl+F",             description: "Find" },
  { keys: "Ctrl+H",             description: "Replace" },
  { keys: "Ctrl+Shift+H",       description: "Replace in selection" },
  { keys: "F3 / Shift+F3",      description: "Find next / previous" },
  { keys: "Alt+Enter",          description: "Select all Find matches" },
  // ── Navigation ──────────────────────────────────────────────────────────
  { keys: "Ctrl+G",             description: "Go to line" },
  { keys: "Ctrl+Shift+O",       description: "Go to symbol in file" },
  { keys: "Ctrl+Home / End",    description: "Jump to start / end of file" },
  { keys: "Alt+← / →",         description: "Jump word left / right" },
  { keys: "Ctrl+← / →",        description: "Move cursor by word" },
  // ── Editing ─────────────────────────────────────────────────────────────
  { keys: "Ctrl+Shift+K",       description: "Delete current line" },
  { keys: "Alt+↑ / ↓",         description: "Move line up / down" },
  { keys: "Shift+Alt+↑ / ↓",   description: "Copy line up / down" },
  { keys: "Ctrl+/ ",            description: "Toggle line comment" },
  { keys: "Shift+Alt+A",        description: "Toggle block comment" },
  { keys: "Ctrl+]  /  Ctrl+[", description: "Indent / outdent line" },
  { keys: "Ctrl+Enter",         description: "Insert line below" },
  { keys: "Ctrl+Shift+Enter",   description: "Insert line above" },
  // ── Code ────────────────────────────────────────────────────────────────
  { keys: "Ctrl+Shift+[ / ]",   description: "Fold / unfold region" },
  { keys: "Ctrl+K Ctrl+0",      description: "Fold all regions" },
  { keys: "Ctrl+K Ctrl+J",      description: "Unfold all regions" },
  { keys: "F12",                description: "Go to definition (if language worker active)" },
  { keys: "Shift+F12",          description: "Peek references" },
  // ── View ────────────────────────────────────────────────────────────────
  { keys: "Ctrl+= / Ctrl+-",    description: "Increase / decrease font size" },
  { keys: "Ctrl+Shift+P",       description: "Open Monaco command palette" },
];

// Monaco action IDs that users can bind to custom keys.
// (non-exhaustive — any editor.action.* ID from Monaco's registry works)
const KNOWN_ACTIONS: string[] = [
  "editor.action.selectHighlights",
  "editor.action.addSelectionToNextFindMatch",
  "editor.action.addSelectionToPreviousFindMatch",
  "editor.action.moveCarretLeftAction",
  "editor.action.moveCarretRightAction",
  "editor.action.insertCursorAbove",
  "editor.action.insertCursorBelow",
  "editor.action.insertCursorAtEndOfEachLineSelected",
  "editor.action.copyLinesDownAction",
  "editor.action.copyLinesUpAction",
  "editor.action.moveLinesDownAction",
  "editor.action.moveLinesUpAction",
  "editor.action.deleteLines",
  "editor.action.commentLine",
  "editor.action.blockComment",
  "editor.action.indentLines",
  "editor.action.outdentLines",
  "editor.action.joinLines",
  "editor.action.transposeLetters",
  "editor.action.transformToUppercase",
  "editor.action.transformToLowercase",
  "editor.action.transformToTitlecase",
  "editor.action.goToDeclaration",
  "editor.action.peekDefinition",
  "editor.action.referenceSearch.trigger",
  "editor.action.formatDocument",
  "editor.action.formatSelection",
  "editor.action.triggerSuggest",
  "editor.action.showHover",
  "editor.action.revealDefinition",
  "editor.action.foldAll",
  "editor.action.unfoldAll",
  "editor.action.fold",
  "editor.action.unfold",
  "editor.action.fontZoomIn",
  "editor.action.fontZoomOut",
  "editor.action.fontZoomReset",
];

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────

/** A single user-defined keybinding. `keychord` is a human-readable string
 *  like "Ctrl+Shift+U" that we parse into a Monaco bitmask at apply time.  */
interface CustomKeybinding {
  /** Monaco action ID, e.g. "editor.action.selectHighlights" */
  actionId: string;
  /** Human-readable key chord, e.g. "Ctrl+Shift+U" */
  keychord: string;
}

interface MonacoSettings {
  extensions: string[];
  fontSize: number;
  lineNumbers: boolean;
  wordWrap: boolean;
  minimap: boolean;
  readOnlyByDefault: boolean;
  theme: "auto" | "vs" | "vs-dark" | "hc-black";
  customKeybindings: CustomKeybinding[];
}

const DEFAULT_SETTINGS: MonacoSettings = {
  extensions: DEFAULT_EXTENSIONS,
  fontSize: 13,
  lineNumbers: true,
  wordWrap: false,
  minimap: true,
  readOnlyByDefault: false,
  theme: "auto",
  customKeybindings: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Key chord parser  (e.g. "Ctrl+Shift+L"  →  monaco.KeyMod bitmask)
// ─────────────────────────────────────────────────────────────────────────────

function parseKeychord(chord: string): number | null {
  const parts = chord.split("+").map((p) => p.trim().toLowerCase());
  let mask = 0;
  for (const part of parts) {
    switch (part) {
      case "ctrl":  case "cmd": mask |= monaco.KeyMod.CtrlCmd; break;
      case "shift":             mask |= monaco.KeyMod.Shift;   break;
      case "alt":               mask |= monaco.KeyMod.Alt;     break;
      case "win":   case "meta":mask |= monaco.KeyMod.WinCtrl; break;
      default: {
        // Look up key code by name
        const code = (monaco.KeyCode as Record<string, number>)[
          "Key" + part.toUpperCase()
        ] ??
        (monaco.KeyCode as Record<string, number>)[
          part.charAt(0).toUpperCase() + part.slice(1)
        ];
        if (code === undefined) return null;
        mask |= code;
      }
    }
  }
  return mask;
}

// ─────────────────────────────────────────────────────────────────────────────
// View
// ─────────────────────────────────────────────────────────────────────────────

class MonacoView extends FileView {
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private readOnly: boolean;
  private isDirty = false;
  private editorContainer: HTMLElement;
  private toolbar: HTMLElement;
  private dirtyDot: HTMLSpanElement;
  private readOnlyBtn: HTMLButtonElement;
  private resizeObserver: ResizeObserver | null = null;
  private themeObserver: MutationObserver | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: MonacoPlugin) {
    super(leaf);
    this.readOnly = plugin.settings.readOnlyByDefault;
  }

  getViewType() {
    return VIEW_TYPE_MONACO;
  }

  getDisplayText() {
    return this.file?.name ?? "Code Editor";
  }

  getIcon() {
    return "code-2";
  }

  canAcceptExtension(extension: string): boolean {
    return this.plugin.settings.extensions.includes(extension.toLowerCase());
  }

  // Called by Obsidian when a file is opened in this leaf
  async onLoadFile(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    const lang = LANG_MAP[file.extension.toLowerCase()] ?? "plaintext";

    if (!this.editor) {
      this.buildEditor(content, lang);
    } else {
      // Re-use editor, swap model
      const oldModel = this.editor.getModel();
      const newModel = monaco.editor.createModel(content, lang);
      this.editor.setModel(newModel);
      oldModel?.dispose();
    }

    this.isDirty = false;
    this.syncDirty();
    this.leaf.updateHeader();
  }

  async onUnloadFile(file: TFile): Promise<void> {
    if (this.isDirty) {
      // Optional: prompt user; for now just warn
      new Notice(`⚠️ Unsaved changes in ${file.name} were discarded.`);
    }
    this.isDirty = false;
    this.syncDirty();
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.style.cssText = "display:flex;flex-direction:column;height:100%;padding:0;overflow:hidden;";

    // ── Toolbar ──────────────────────────────────────────────────────────────
    this.toolbar = root.createDiv({ cls: "monaco-toolbar" });
    this.toolbar.style.cssText = [
      "display:flex;align-items:center;gap:6px;",
      "padding:4px 8px;flex-shrink:0;",
      "border-bottom:1px solid var(--background-modifier-border);",
      "background:var(--background-secondary);",
      "font-family:var(--font-interface);",
    ].join("");

    const saveBtn = this.toolbar.createEl("button", { text: "Save" });
    applyBtnStyle(saveBtn);
    saveBtn.addEventListener("click", () => this.save());

    this.readOnlyBtn = this.toolbar.createEl("button", {
      text: this.readOnly ? "🔒 Read-only" : "✏️ Editing",
    });
    applyBtnStyle(this.readOnlyBtn);
    this.readOnlyBtn.addEventListener("click", () => this.toggleReadOnly());

    this.dirtyDot = this.toolbar.createEl("span", { text: "" });
    this.dirtyDot.style.cssText =
      "margin-left:auto;font-size:11px;color:var(--text-muted);";

    // ── Editor Container ─────────────────────────────────────────────────────
    this.editorContainer = root.createDiv({ cls: "monaco-editor-container" });
    this.editorContainer.style.cssText = "flex:1;overflow:hidden;";

    // Relay size changes to Monaco
    this.resizeObserver = new ResizeObserver(() => this.editor?.layout());
    this.resizeObserver.observe(this.editorContainer);

    // ── Conflict shield ───────────────────────────────────────────────────────
    // Obsidian registers keydown handlers on the document. Monaco's own handlers
    // run at the container level and call stopPropagation for keys it consumes,
    // BUT only after Monaco processes them — which happens in the bubble phase.
    // Obsidian's document handler fires at the end of that same bubble phase,
    // potentially before Monaco has a chance to stop it.
    //
    // Solution: capture-phase listener at the container that stops propagation
    // for known conflicts when the editor has focus. This fires before any
    // bubble-phase listeners anywhere in the tree.
    this.editorContainer.addEventListener(
      "keydown",
      (e: KeyboardEvent) => {
        if (!this.editor?.hasWidgetFocus()) return;
        if (OBSIDIAN_CONFLICTS.some((rule) => matchesConflict(e, rule))) {
          e.stopPropagation();
          // Don't preventDefault — Monaco still needs to process the key
        }
      },
      true // capture phase
    );
  }

  private buildEditor(content: string, language: string) {
    const theme = this.resolveTheme();

    this.editor = monaco.editor.create(this.editorContainer, {
      value: content,
      language,
      theme,
      readOnly: this.readOnly,
      fontSize: this.plugin.settings.fontSize,
      lineNumbers: this.plugin.settings.lineNumbers ? "on" : "off",
      wordWrap: this.plugin.settings.wordWrap ? "on" : "off",
      minimap: { enabled: this.plugin.settings.minimap },
      automaticLayout: false, // handled by ResizeObserver above
      scrollBeyondLastLine: false,
      renderLineHighlight: "all",
      smoothScrolling: true,
      cursorBlinking: "smooth",
      bracketPairColorization: { enabled: true },
      folding: true,
      padding: { top: 8, bottom: 8 },
    });

    // Dirty tracking
    this.editor.onDidChangeModelContent(() => {
      if (!this.isDirty) {
        this.isDirty = true;
        this.syncDirty();
      }
    });

    // Cmd/Ctrl+S → save
    this.editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => this.save()
    );

    // ── Custom keybindings from settings ─────────────────────────────────────
    this.applyCustomKeybindings();

    // Auto theme sync
    if (this.plugin.settings.theme === "auto") {
      this.themeObserver = new MutationObserver(() => {
        monaco.editor.setTheme(this.resolveTheme());
      });
      this.themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
  }

  /** Apply (or re-apply) user-defined custom keybindings to the editor. */
  applyCustomKeybindings() {
    if (!this.editor) return;
    for (const binding of this.plugin.settings.customKeybindings) {
      const keymask = parseKeychord(binding.keychord);
      if (keymask === null) {
        console.warn(`[Monaco Plugin] Could not parse keychord: "${binding.keychord}"`);
        continue;
      }
      // addAction registers a command + keybinding together.
      // Using a unique id prevents duplicate registrations if called again.
      try {
        this.editor.addAction({
          id: `user.${binding.actionId}.${binding.keychord}`,
          label: `Custom: ${binding.actionId}`,
          keybindings: [keymask],
          run(ed) {
            ed.trigger("keyboard", binding.actionId, null);
          },
        });
      } catch (e) {
        console.warn(`[Monaco Plugin] Could not register keybinding for ${binding.actionId}:`, e);
      }
    }
  }

  private resolveTheme(): string {
    if (this.plugin.settings.theme !== "auto") {
      return this.plugin.settings.theme;
    }
    return document.body.classList.contains("theme-dark") ? "vs-dark" : "vs";
  }

  private toggleReadOnly() {
    this.readOnly = !this.readOnly;
    this.editor?.updateOptions({ readOnly: this.readOnly });
    this.readOnlyBtn.setText(this.readOnly ? "🔒 Read-only" : "✏️ Editing");
  }

  async save() {
    if (!this.file || !this.editor) return;
    try {
      await this.app.vault.modify(this.file, this.editor.getValue());
      this.isDirty = false;
      this.syncDirty();
      new Notice(`✔ Saved ${this.file.name}`);
    } catch (e) {
      new Notice(`✘ Save failed: ${e}`);
    }
  }

  private syncDirty() {
    this.dirtyDot?.setText(this.isDirty ? "● unsaved changes" : "");
  }

  async onClose() {
    this.editor?.dispose();
    this.resizeObserver?.disconnect();
    this.themeObserver?.disconnect();
  }
}

function applyBtnStyle(btn: HTMLButtonElement) {
  btn.style.cssText = [
    "font-size:12px;padding:2px 10px;cursor:pointer;border-radius:4px;",
    "background:var(--interactive-normal);color:var(--text-normal);",
    "border:1px solid var(--background-modifier-border);",
  ].join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

export default class MonacoPlugin extends Plugin {
  settings: MonacoSettings;

  async onload() {
    await this.loadSettings();

    // Disable Monaco web workers — syntax highlighting/tokenization runs on
    // the main thread fine; workers add LSP features we don't need here.
    (window as any).MonacoEnvironment = {
      getWorker(_moduleId: unknown, _label: string) {
        const blob = new Blob([""], { type: "application/javascript" });
        return new Worker(URL.createObjectURL(blob));
      },
    };

    this.registerView(
      VIEW_TYPE_MONACO,
      (leaf) => new MonacoView(leaf, this)
    );

    // Intercept these extensions so Obsidian routes them to our view
    this.registerExtensions(this.settings.extensions, VIEW_TYPE_MONACO);

    this.addSettingTab(new MonacoSettingTab(this.app, this));

    console.log("[Monaco Plugin] Loaded — handling:", this.settings.extensions.join(", "));
  }

  async onunload() {
    console.log("[Monaco Plugin] Unloaded");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings Tab
// ─────────────────────────────────────────────────────────────────────────────

class MonacoSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: MonacoPlugin) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Monaco Code Editor" });

    // ── Editor ───────────────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Editor" });

    new Setting(containerEl)
      .setName("Font size")
      .setDesc("Editor font size in pixels (10–24)")
      .addSlider((sl) =>
        sl
          .setLimits(10, 24, 1)
          .setValue(this.plugin.settings.fontSize)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.fontSize = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Theme")
      .setDesc("Color theme for the editor")
      .addDropdown((dd) =>
        dd
          .addOption("auto", "Auto (follow Obsidian)")
          .addOption("vs", "Light (VS)")
          .addOption("vs-dark", "Dark (VS Dark)")
          .addOption("hc-black", "High Contrast")
          .setValue(this.plugin.settings.theme)
          .onChange(async (v: MonacoSettings["theme"]) => {
            this.plugin.settings.theme = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Line numbers")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.lineNumbers).onChange(async (v) => {
          this.plugin.settings.lineNumbers = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Word wrap")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.wordWrap).onChange(async (v) => {
          this.plugin.settings.wordWrap = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Minimap")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.minimap).onChange(async (v) => {
          this.plugin.settings.minimap = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Open files read-only by default")
      .setDesc("Toggle to edit mode per-file from the toolbar")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.readOnlyByDefault)
          .onChange(async (v) => {
            this.plugin.settings.readOnlyByDefault = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Handled extensions")
      .setDesc(
        "Comma-separated extensions (no dots) that open in Monaco. " +
          "Requires reloading the plugin to take effect. Avoid adding 'md'."
      )
      .addTextArea((ta) => {
        ta.inputEl.style.width = "100%";
        ta.inputEl.rows = 5;
        ta.setValue(this.plugin.settings.extensions.join(", ")).onChange(
          async (v) => {
            this.plugin.settings.extensions = v
              .split(",")
              .map((e) => e.trim().toLowerCase())
              .filter(Boolean);
            await this.plugin.saveSettings();
          }
        );
      });

    // ── Custom Keybindings ───────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Custom Keybindings" });
    containerEl.createEl("p", {
      text: "Remap any Monaco action to a key chord. Changes apply to newly opened editors.",
      cls: "setting-item-description",
    });

    const bindingsContainer = containerEl.createDiv();
    const renderBindings = () => {
      bindingsContainer.empty();
      this.plugin.settings.customKeybindings.forEach((binding, idx) => {
        const row = new Setting(bindingsContainer)
          .addText((t) =>
            t
              .setPlaceholder("editor.action.selectHighlights")
              .setValue(binding.actionId)
              .onChange(async (v) => {
                this.plugin.settings.customKeybindings[idx].actionId = v.trim();
                await this.plugin.saveSettings();
              })
          )
          .addText((t) =>
            t
              .setPlaceholder("Ctrl+Shift+U")
              .setValue(binding.keychord)
              .onChange(async (v) => {
                this.plugin.settings.customKeybindings[idx].keychord = v.trim();
                await this.plugin.saveSettings();
              })
          )
          .addButton((btn) =>
            btn
              .setIcon("trash")
              .setTooltip("Remove")
              .onClick(async () => {
                this.plugin.settings.customKeybindings.splice(idx, 1);
                await this.plugin.saveSettings();
                renderBindings();
              })
          );
        row.settingEl.style.borderBottom =
          "1px solid var(--background-modifier-border)";

        // Label the two text inputs
        const [actionInput, keyInput] = Array.from(
          row.settingEl.querySelectorAll<HTMLInputElement>("input[type=text]")
        );
        if (actionInput) actionInput.style.width = "260px";
        if (keyInput) keyInput.style.width = "140px";
      });
    };
    renderBindings();

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText("+ Add keybinding")
        .onClick(async () => {
          this.plugin.settings.customKeybindings.push({
            actionId: "",
            keychord: "",
          });
          await this.plugin.saveSettings();
          renderBindings();
        })
    );

    // Action ID reference (collapsible details)
    const details = containerEl.createEl("details");
    details.createEl("summary", { text: "Available Monaco action IDs" });
    details.style.cssText =
      "margin:8px 0 16px;font-size:12px;color:var(--text-muted);";
    const ul = details.createEl("ul");
    ul.style.cssText = "columns:2;list-style:none;padding:0;margin:8px 0 0;";
    for (const id of KNOWN_ACTIONS) {
      ul.createEl("li", { text: id }).style.cssText =
        "font-family:var(--font-monospace);font-size:11px;padding:1px 0;";
    }

    // ── Keyboard Reference ───────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Built-in Keyboard Shortcuts" });
    containerEl.createEl("p", {
      text: "All VS Code multi-cursor and editing shortcuts work out of the box when the editor has focus.",
      cls: "setting-item-description",
    });

    const table = containerEl.createEl("table");
    table.style.cssText =
      "width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;";
    const thead = table.createEl("thead");
    const hrow = thead.createEl("tr");
    for (const h of ["Shortcut", "Action"]) {
      const th = hrow.createEl("th", { text: h });
      th.style.cssText =
        "text-align:left;padding:4px 8px;border-bottom:2px solid var(--background-modifier-border);";
    }
    const tbody = table.createEl("tbody");
    BUILTIN_SHORTCUTS.forEach(({ keys, description }, i) => {
      const tr = tbody.createEl("tr");
      tr.style.background =
        i % 2 === 0 ? "transparent" : "var(--background-secondary)";
      const tdKeys = tr.createEl("td", { text: keys });
      tdKeys.style.cssText =
        "font-family:var(--font-monospace);padding:4px 8px;white-space:nowrap;";
      const tdDesc = tr.createEl("td", { text: description });
      tdDesc.style.cssText = "padding:4px 8px;";
    });
  }
}
