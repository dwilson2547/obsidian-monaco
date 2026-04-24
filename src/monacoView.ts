import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import { FileSystemAdapter, FileView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import * as monaco from 'monaco-editor';
import product from 'monaco-editor/esm/vs/platform/product/common/product.js';
import { registerSingleton } from 'monaco-editor/esm/vs/platform/instantiation/common/extensions.js';
import { IProductService } from 'monaco-editor/esm/vs/platform/product/common/productService.js';
import { StandaloneServices } from 'monaco-editor/esm/vs/editor/standalone/browser/standaloneServices.js';
import type MonacoPlugin from './main';
import { getLanguageForExtension } from './languageMap';

export const MONACO_VIEW_TYPE = 'monaco-editor-view';

const MAX_CONSOLE_OUTPUT_CHARS = 100_000;
const TEXT_DECODER = new TextDecoder();
let monacoServicesInitialized = false;

class StandaloneProductService {
	readonly quality: string;
	[key: string]: unknown;

	constructor() {
		Object.assign(this, product);
		this.quality = typeof product.quality === 'string' ? product.quality : 'stable';
	}
}

registerSingleton(IProductService, StandaloneProductService, false);

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
			const blob = new Blob(['self.onmessage=function(){}'], {
				type: 'application/javascript',
			});
			return new Worker(URL.createObjectURL(blob));
		},
	};
}

function ensureMonacoServices(): void {
	if (monacoServicesInitialized) return;

	StandaloneServices.initialize({});
	monacoServicesInitialized = true;
}

function bufferToString(data: unknown): string {
	if (typeof data === 'string') return data;
	if (data instanceof Uint8Array) return TEXT_DECODER.decode(data);
	if (data instanceof ArrayBuffer) return TEXT_DECODER.decode(new Uint8Array(data));
	return String(data);
}

function joinVaultPath(basePath: string, vaultPath: string): string {
	const segments = vaultPath.split('/').filter(segment => segment.length > 0);
	return segments.length > 0 ? path.join(basePath, ...segments) : basePath;
}

function readDesktopClipboardText(): string {
	const requireFn = (globalThis as typeof globalThis & {
		require?: (moduleName: string) => unknown;
	}).require;
	if (!requireFn) return '';

	const electronModule = requireFn('electron') as {
		clipboard?: { readText: () => string };
	};
	return electronModule.clipboard?.readText() ?? '';
}

export class MonacoView extends FileView {
	private editor: monaco.editor.IStandaloneCodeEditor | null = null;
	private readonly plugin: MonacoPlugin;
	private readonly layoutEl: HTMLDivElement;
	private readonly editorContainer: HTMLDivElement;
	private readonly consoleEl: HTMLDivElement;
	private readonly consoleToggleButtonEl: HTMLButtonElement;
	private readonly consolePathEl: HTMLSpanElement;
	private readonly consoleStatusEl: HTMLSpanElement;
	private readonly consoleBodyEl: HTMLDivElement;
	private readonly consoleOutputEl: HTMLPreElement;
	private readonly consoleInputEl: HTMLInputElement;
	private readonly consoleSubmitButtonEl: HTMLButtonElement;
	private readonly consoleStopButtonEl: HTMLButtonElement;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly commandHistory: string[] = [];
	private commandHistoryIndex = 0;
	private detachPasteFallback: (() => void) | null = null;
	private isConsoleCollapsed = true;
	private isLoading = false;
	private activeProcess: ChildProcessWithoutNullStreams | null = null;
	private currentWorkingDirectory: string | null = null;
	private currentWorkingDirectoryLabel = '/';

	constructor(leaf: WorkspaceLeaf, plugin: MonacoPlugin) {
		super(leaf);
		this.plugin = plugin;

		this.contentEl.addClass('monaco-view-content');
		this.layoutEl = this.contentEl.createDiv({ cls: 'monaco-view-layout' });
		this.editorContainer = this.layoutEl.createDiv({ cls: 'monaco-editor-container' });
		this.consoleEl = this.layoutEl.createDiv({ cls: 'monaco-console is-collapsed' });

		const consoleHeaderEl = this.consoleEl.createDiv({ cls: 'monaco-console-header' });
		this.consoleToggleButtonEl = consoleHeaderEl.createEl('button', {
			cls: 'monaco-console-toggle',
			text: 'Show console',
			attr: { type: 'button' },
		});
		const consoleMetaEl = consoleHeaderEl.createDiv({ cls: 'monaco-console-meta' });
		this.consolePathEl = consoleMetaEl.createSpan({
			cls: 'monaco-console-path',
			text: 'Current folder: /',
		});
		this.consoleStatusEl = consoleMetaEl.createSpan({
			cls: 'monaco-console-status',
			text: 'Idle',
		});
		const consoleActionsEl = consoleHeaderEl.createDiv({ cls: 'monaco-console-actions' });
		const clearButtonEl = consoleActionsEl.createEl('button', {
			cls: 'monaco-console-action-button',
			text: 'Clear',
			attr: { type: 'button' },
		});
		this.consoleStopButtonEl = consoleActionsEl.createEl('button', {
			cls: 'monaco-console-action-button',
			text: 'Stop',
			attr: { type: 'button' },
		});

		this.consoleBodyEl = this.consoleEl.createDiv({ cls: 'monaco-console-body' });
		this.consoleOutputEl = this.consoleBodyEl.createEl('pre', { cls: 'monaco-console-output' });
		const consoleFormEl = this.consoleBodyEl.createEl('form', { cls: 'monaco-console-form' });
		consoleFormEl.createSpan({ cls: 'monaco-console-prompt', text: '>' });
		this.consoleInputEl = consoleFormEl.createEl('input', {
			cls: 'monaco-console-input',
			attr: {
				type: 'text',
				placeholder: 'Run a command',
				autocomplete: 'off',
				autocapitalize: 'off',
			},
		});
		this.consoleSubmitButtonEl = consoleFormEl.createEl('button', {
			cls: 'monaco-console-submit',
			text: 'Run',
			attr: { type: 'submit' },
		});

		this.consoleToggleButtonEl.addEventListener('click', () => {
			this.setConsoleCollapsed(!this.isConsoleCollapsed);
		});
		clearButtonEl.addEventListener('click', () => {
			this.consoleOutputEl.textContent = '';
		});
		this.consoleStopButtonEl.addEventListener('click', () => {
			this.stopActiveProcess();
		});
		consoleFormEl.addEventListener('submit', event => {
			event.preventDefault();
			const value = this.consoleInputEl.value.trim();
			if (value.length === 0) return;

			this.consoleInputEl.value = '';
			if (this.activeProcess) {
				this.sendProcessInput(value);
			} else {
				this.runCommand(value);
			}
		});
		this.consoleInputEl.addEventListener('keydown', event => {
			if (this.activeProcess) return;
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				this.moveHistory(-1);
			} else if (event.key === 'ArrowDown') {
				event.preventDefault();
				this.moveHistory(1);
			}
		});

		this.updateConsoleUi();
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

	async onLoadFile(file: TFile): Promise<void> {
		this.updateWorkingDirectory(file);
		this.isLoading = true;
		ensureMonacoServices();

		try {
			const content = await this.app.vault.read(file);
			const language = getLanguageForExtension(file.extension);
			const uri = monaco.Uri.file(file.path);

			if (this.editor) {
				let model = monaco.editor.getModel(uri);
				if (!model) {
					model = monaco.editor.createModel(content, language, uri);
				} else if (model.getValue() !== content) {
					model.setValue(content);
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
		const model = monaco.editor.getModel(monaco.Uri.file(file.path));
		if (model) {
			model.dispose();
		}
	}

	private createEditor(
		content: string,
		language: string,
		uri: monaco.Uri,
	): void {
		ensureMonacoEnvironment();
		ensureMonacoServices();

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
			automaticLayout: true,
			scrollBeyondLastLine: false,
			renderWhitespace: 'selection',
			folding: true,
			bracketPairColorization: { enabled: true },
			multiCursorModifier: 'alt',
			mouseWheelZoom: true,
			smoothScrolling: true,
			contextmenu: true,
			lineNumbers: 'on',
			cursorBlinking: 'blink',
		});
		this.installPasteFallback();

		this.editor.onDidChangeModelContent(() => {
			if (this.isLoading || !this.file) return;
			if (this.saveTimer !== null) clearTimeout(this.saveTimer);
			this.saveTimer = setTimeout(() => this.flushSave(), 500);
		});
	}

	private installPasteFallback(): void {
		if (!this.editor) return;

		this.detachPasteFallback?.();
		const isFocusedWithinEditor = (): boolean => {
			if (!this.editor) return false;
			if (this.editor.hasTextFocus()) return true;

			const activeElement = document.activeElement;
			return activeElement instanceof Node && this.editorContainer.contains(activeElement);
		};

		const insertText = (text: string, clipboardEvent?: ClipboardEvent): void => {
			if (!this.editor || text.length === 0) return;
			this.editor.focus();
			this.editor.trigger('keyboard', 'paste', {
				text,
				clipboardEvent,
			});
		};

		const handlePaste = (event: ClipboardEvent): void => {
			const target = event.target;
			if (!(target instanceof Node) || !this.editorContainer.contains(target)) return;
			if (!isFocusedWithinEditor()) return;

			const text = event.clipboardData?.getData('text/plain');
			if (!text) return;

			event.preventDefault();
			event.stopPropagation();
			insertText(text, event);
		};
		const handleKeydown = (event: KeyboardEvent): void => {
			if (!isFocusedWithinEditor()) return;
			if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
			if (event.key.toLowerCase() !== 'v') return;

			const text = readDesktopClipboardText();
			if (!text) return;

			event.preventDefault();
			event.stopPropagation();
			insertText(text);
		};

		document.addEventListener('paste', handlePaste, true);
		document.addEventListener('keydown', handleKeydown, true);
		this.detachPasteFallback = () => {
			document.removeEventListener('paste', handlePaste, true);
			document.removeEventListener('keydown', handleKeydown, true);
		};
	}

	private flushSave(): void {
		if (this.saveTimer !== null) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		if (this.file && this.editor) {
			this.app.vault.modify(this.file, this.editor.getValue()).catch((err: unknown) => {
				console.error('[Monaco] Failed to save', this.file?.path, err);
			});
		}
	}

	private updateWorkingDirectory(file: TFile | null): void {
		const adapter = this.app.vault.adapter;
		const folderPath = file?.parent?.path ?? '/';
		this.currentWorkingDirectoryLabel = folderPath === '/' ? '/' : `/${folderPath}`;

		if (!(adapter instanceof FileSystemAdapter)) {
			this.currentWorkingDirectory = null;
			this.consolePathEl.setText('Current folder: unavailable for this vault');
			this.consoleStatusEl.setText('Terminal unavailable');
			this.consoleInputEl.disabled = true;
			this.consoleSubmitButtonEl.disabled = true;
			return;
		}

		const basePath = adapter.getBasePath();
		this.currentWorkingDirectory = joinVaultPath(basePath, folderPath);
		this.consolePathEl.setText(`Current folder: ${this.currentWorkingDirectoryLabel}`);
		this.consoleInputEl.disabled = false;
		this.updateConsoleUi();
	}

	private setConsoleCollapsed(collapsed: boolean): void {
		this.isConsoleCollapsed = collapsed;
		this.consoleEl.classList.toggle('is-collapsed', collapsed);
		this.consoleToggleButtonEl.setText(collapsed ? 'Show console' : 'Hide console');
		this.updateConsoleUi();
		this.editor?.layout();

		if (!collapsed) {
			window.setTimeout(() => {
				this.editor?.layout();
				this.consoleInputEl.focus();
			}, 0);
		}
	}

	private moveHistory(direction: -1 | 1): void {
		if (this.commandHistory.length === 0) return;

		this.commandHistoryIndex = Math.min(
			this.commandHistory.length,
			Math.max(0, this.commandHistoryIndex + direction),
		);

		this.consoleInputEl.value =
			this.commandHistory[this.commandHistoryIndex] ?? '';
	}

	private runCommand(command: string): void {
		if (!this.currentWorkingDirectory) {
			new Notice('Monaco console is only available for local filesystem vaults.');
			return;
		}

		this.commandHistory.push(command);
		this.commandHistoryIndex = this.commandHistory.length;
		this.setConsoleCollapsed(false);
		this.appendConsoleOutput(`$ ${command}\n`);

		const child = spawn(command, {
			cwd: this.currentWorkingDirectory,
			shell: true,
			windowsHide: true,
		});

		this.activeProcess = child;
		this.updateConsoleUi();

		child.stdout.on('data', data => {
			this.appendConsoleOutput(bufferToString(data));
		});
		child.stderr.on('data', data => {
			this.appendConsoleOutput(bufferToString(data));
		});
		child.on('error', error => {
			this.appendConsoleOutput(`\n[error] ${error.message}\n`);
			if (this.activeProcess === child) {
				this.activeProcess = null;
				this.updateConsoleUi();
			}
		});
		child.on('close', (code, signal) => {
			const summary = signal ? `[terminated: ${signal}]` : `[exit code: ${code ?? 0}]`;
			this.appendConsoleOutput(`\n${summary}\n`);
			if (this.activeProcess === child) {
				this.activeProcess = null;
				this.updateConsoleUi();
			}
		});
	}

	private sendProcessInput(value: string): void {
		if (!this.activeProcess) return;
		this.appendConsoleOutput(`> ${value}\n`);
		this.activeProcess.stdin.write(`${value}\n`);
	}

	private stopActiveProcess(): void {
		if (!this.activeProcess) return;
		this.appendConsoleOutput('\n[stopping process]\n');
		this.activeProcess.kill();
	}

	private appendConsoleOutput(text: string): void {
		const nextText = `${this.consoleOutputEl.textContent ?? ''}${text}`;
		this.consoleOutputEl.textContent =
			nextText.length > MAX_CONSOLE_OUTPUT_CHARS
				? nextText.slice(nextText.length - MAX_CONSOLE_OUTPUT_CHARS)
				: nextText;
		this.consoleOutputEl.scrollTop = this.consoleOutputEl.scrollHeight;
	}

	private updateConsoleUi(): void {
		if (!this.currentWorkingDirectory) {
			this.consoleStatusEl.setText('Terminal unavailable');
			this.consoleSubmitButtonEl.setText('Run');
			this.consoleSubmitButtonEl.disabled = true;
			this.consoleStopButtonEl.disabled = true;
			return;
		}

		if (this.activeProcess) {
			this.consoleStatusEl.setText(`Running in ${this.currentWorkingDirectoryLabel}`);
			this.consoleInputEl.placeholder = 'Send input to running process';
			this.consoleSubmitButtonEl.setText('Send');
			this.consoleStopButtonEl.disabled = false;
		} else {
			this.consoleStatusEl.setText('Idle');
			this.consoleInputEl.placeholder = 'Run a command';
			this.consoleSubmitButtonEl.setText('Run');
			this.consoleStopButtonEl.disabled = true;
		}

		this.consoleSubmitButtonEl.disabled = false;
	}

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

	onResize(): void {
		this.editor?.layout();
	}

	async onClose(): Promise<void> {
		this.flushSave();
		this.stopActiveProcess();
		this.detachPasteFallback?.();
		this.detachPasteFallback = null;
		if (this.editor) {
			const model = this.editor.getModel();
			model?.dispose();
			this.editor.dispose();
			this.editor = null;
		}
	}
}
