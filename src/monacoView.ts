import { FileView, TFile, WorkspaceLeaf } from 'obsidian';
import * as monaco from 'monaco-editor';
import type MonacoPlugin from './main';
import { getLanguageForExtension } from './languageMap';

export const MONACO_VIEW_TYPE = 'monaco-editor-view';

/**
 * Set up the global MonacoEnvironment so that Monaco doesn't try to load web
 * workers from a separate URL (which would fail in the bundled plugin context).
 * Instead we provide a minimal inline worker; Monaco gracefully falls back to
 * running language services on the main thread when workers return nothing
 * useful.
 */
function ensureMonacoEnvironment(): void {
	if ((globalThis as Record<string, unknown>)['MonacoEnvironment']) return;

	(globalThis as Record<string, unknown>)['MonacoEnvironment'] = {
		getWorker(_workerId: string, _label: string): Worker {
			// An empty worker causes Monaco to run tokenisation on the main
			// thread – full editing features (multi-cursor, folding, etc.) still
			// work; only deep IntelliSense (TS type-checking, JSON schema) is
			// unavailable without a real language server.
			const blob = new Blob(['self.onmessage=function(){}'], {
				type: 'application/javascript',
			});
			return new Worker(URL.createObjectURL(blob));
		},
	};
}

export class MonacoView extends FileView {
	private editor: monaco.editor.IStandaloneCodeEditor | null = null;
	private readonly editorContainer: HTMLDivElement;
	private readonly plugin: MonacoPlugin;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	/** Guard against triggering saves while we are programmatically loading content. */
	private isLoading = false;

	constructor(leaf: WorkspaceLeaf, plugin: MonacoPlugin) {
		super(leaf);
		this.plugin = plugin;
		// Remove default padding from the content pane so Monaco fills it fully
		this.contentEl.addClass('monaco-view-content');
		this.editorContainer = this.contentEl.createDiv({ cls: 'monaco-editor-container' });
	}

	getViewType(): string {
		return MONACO_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file?.name ?? 'Monaco Editor';
	}

	getIcon(): string {
		return 'code-2';
	}

	// ── File lifecycle ──────────────────────────────────────────────────────

	async onLoadFile(file: TFile): Promise<void> {
		this.isLoading = true;
		try {
			const content = await this.app.vault.read(file);
			const language = getLanguageForExtension(file.extension);
			const uri = monaco.Uri.file(file.path);

			if (this.editor) {
				// Reuse existing editor – swap the model
				let model = monaco.editor.getModel(uri);
				if (!model) {
					model = monaco.editor.createModel(content, language, uri);
				} else {
					// Keep existing edits; only replace if content differs
					if (model.getValue() !== content) {
						model.setValue(content);
					}
				}
				this.editor.setModel(model);
			} else {
				this.createEditor(content, language, uri);
			}
		} finally {
			this.isLoading = false;
		}
	}

	async onUnloadFile(file: TFile): Promise<void> {
		this.flushSave();
		// Release the model for this file so memory isn't leaked
		const model = monaco.editor.getModel(monaco.Uri.file(file.path));
		if (model) {
			model.dispose();
		}
	}

	// ── Editor creation ─────────────────────────────────────────────────────

	private createEditor(
		content: string,
		language: string,
		uri: monaco.Uri,
	): void {
		ensureMonacoEnvironment();

		const model =
			monaco.editor.getModel(uri) ??
			monaco.editor.createModel(content, language, uri);

		const { settings } = this.plugin;

		this.editor = monaco.editor.create(this.editorContainer, {
			model,
			theme: settings.theme,
			fontSize: settings.fontSize,
			wordWrap: settings.wordWrap,
			minimap: { enabled: settings.minimap },
			// Layout
			automaticLayout: true,
			scrollBeyondLastLine: false,
			// Editing quality-of-life
			renderWhitespace: 'selection',
			folding: true,
			bracketPairColorization: { enabled: true },
			// Multi-cursor: Alt+Click (mirrors VS Code default)
			multiCursorModifier: 'alt',
			// Mouse / scroll
			mouseWheelZoom: true,
			smoothScrolling: true,
			// Misc
			contextmenu: true,
			lineNumbers: 'on',
			cursorBlinking: 'blink',
		});

		// Debounced auto-save on every content change
		this.editor.onDidChangeModelContent(() => {
			if (this.isLoading || !this.file) return;
			if (this.saveTimer !== null) clearTimeout(this.saveTimer);
			this.saveTimer = setTimeout(() => this.flushSave(), 500);
		});
	}

	// ── Save helper ─────────────────────────────────────────────────────────

	private flushSave(): void {
		if (this.saveTimer !== null) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		if (this.file && this.editor) {
			// fire-and-forget; failures are logged to the console
			this.app.vault.modify(this.file, this.editor.getValue()).catch((err: unknown) => {
				console.error('[Monaco] Failed to save', this.file?.path, err);
			});
		}
	}

	// ── Settings hot-reload ─────────────────────────────────────────────────

	/** Called by the plugin when the user changes settings so open editors update immediately. */
	applySettings(): void {
		if (!this.editor) return;
		const { settings } = this.plugin;
		monaco.editor.setTheme(settings.theme);
		this.editor.updateOptions({
			fontSize: settings.fontSize,
			wordWrap: settings.wordWrap,
			minimap: { enabled: settings.minimap },
		});
	}

	// ── Obsidian view callbacks ──────────────────────────────────────────────

	onResize(): void {
		this.editor?.layout();
	}

	async onClose(): Promise<void> {
		this.flushSave();
		if (this.editor) {
			const model = this.editor.getModel();
			model?.dispose();
			this.editor.dispose();
			this.editor = null;
		}
	}
}
