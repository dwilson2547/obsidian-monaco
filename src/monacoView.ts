import path from 'path';
import process from 'process';
import { FileSystemAdapter, FileView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import * as monaco from 'monaco-editor';
import product from 'monaco-editor/esm/vs/platform/product/common/product.js';
import { registerSingleton } from 'monaco-editor/esm/vs/platform/instantiation/common/extensions.js';
import { IProductService } from 'monaco-editor/esm/vs/platform/product/common/productService.js';
import { StandaloneServices } from 'monaco-editor/esm/vs/editor/standalone/browser/standaloneServices.js';
import { SplitView } from 'monaco-editor/esm/vs/base/browser/ui/splitview/splitview.js';
import { Terminal } from '@xterm/xterm';
import type { IDisposable as XtermDisposable, ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { IDisposable as PtyDisposable, IPty } from 'node-pty';
import type MonacoPlugin from './main';
import { getLanguageForExtension } from './languageMap';
import type { MonacoPluginSettings } from './settings';
import { resolveTerminalShell } from './settings';

export const MONACO_VIEW_TYPE = 'monaco-editor-view';

type NodePtyModule = typeof import('node-pty');
type RequireLike = (moduleName: string) => unknown;

let monacoServicesInitialized = false;
let cachedNodePty: NodePtyModule | null | undefined;
let untitledEditorCount = 0;

const EDITOR_MIN_HEIGHT = 120;
const TERMINAL_COLLAPSED_HEIGHT = 42;
const TERMINAL_DEFAULT_HEIGHT = 240;
const TERMINAL_MIN_EXPANDED_HEIGHT = 100;

const TERMINAL_THEME_PALETTES: Record<MonacoPluginSettings['theme'], ITheme> = {
	'vs': {
		background: '#ffffff',
		foreground: '#333333',
		cursor: '#000000',
		cursorAccent: '#ffffff',
		selectionBackground: 'rgba(173, 214, 255, 0.45)',
		selectionInactiveBackground: 'rgba(173, 214, 255, 0.25)',
		black: '#000000',
		red: '#cd3131',
		green: '#00bc00',
		yellow: '#949800',
		blue: '#0451a5',
		magenta: '#bc05bc',
		cyan: '#0598bc',
		white: '#555555',
		brightBlack: '#666666',
		brightRed: '#cd3131',
		brightGreen: '#14ce14',
		brightYellow: '#b5ba00',
		brightBlue: '#0451a5',
		brightMagenta: '#bc05bc',
		brightCyan: '#0598bc',
		brightWhite: '#a5a5a5',
	},
	'vs-dark': {
		background: '#1e1e1e',
		foreground: '#d4d4d4',
		cursor: '#aeafad',
		cursorAccent: '#1e1e1e',
		selectionBackground: 'rgba(38, 79, 120, 0.5)',
		selectionInactiveBackground: 'rgba(38, 79, 120, 0.3)',
		black: '#000000',
		red: '#cd3131',
		green: '#0dbc79',
		yellow: '#e5e510',
		blue: '#2472c8',
		magenta: '#bc3fbc',
		cyan: '#11a8cd',
		white: '#e5e5e5',
		brightBlack: '#666666',
		brightRed: '#f14c4c',
		brightGreen: '#23d18b',
		brightYellow: '#f5f543',
		brightBlue: '#3b8eea',
		brightMagenta: '#d670d6',
		brightCyan: '#29b8db',
		brightWhite: '#ffffff',
	},
	'hc-black': {
		background: '#000000',
		foreground: '#ffffff',
		cursor: '#ffffff',
		cursorAccent: '#000000',
		selectionBackground: 'rgba(255, 255, 255, 0.25)',
		selectionInactiveBackground: 'rgba(255, 255, 255, 0.15)',
		black: '#000000',
		red: '#ff5f5f',
		green: '#00ff00',
		yellow: '#ffff00',
		blue: '#00aaff',
		magenta: '#ff00ff',
		cyan: '#00ffff',
		white: '#ffffff',
		brightBlack: '#7f7f7f',
		brightRed: '#ff8080',
		brightGreen: '#66ff66',
		brightYellow: '#ffff66',
		brightBlue: '#66ccff',
		brightMagenta: '#ff66ff',
		brightCyan: '#66ffff',
		brightWhite: '#ffffff',
	},
	'hc-light': {
		background: '#ffffff',
		foreground: '#292929',
		cursor: '#000000',
		cursorAccent: '#ffffff',
		selectionBackground: 'rgba(0, 0, 0, 0.16)',
		selectionInactiveBackground: 'rgba(0, 0, 0, 0.1)',
		black: '#000000',
		red: '#b5200d',
		green: '#007100',
		yellow: '#6f5f00',
		blue: '#0047a3',
		magenta: '#a200a2',
		cyan: '#007d8a',
		white: '#666666',
		brightBlack: '#666666',
		brightRed: '#cd3131',
		brightGreen: '#008000',
		brightYellow: '#7a6a00',
		brightBlue: '#0451a5',
		brightMagenta: '#bc05bc',
		brightCyan: '#0598bc',
		brightWhite: '#a5a5a5',
	},
};

type SplitPaneDisposable = { dispose(): void };
type SplitPaneListener = (size: number) => void;

class StaticSplitPane {
	readonly onDidChange = (_listener: SplitPaneListener): SplitPaneDisposable => ({
		dispose() {},
	});

	constructor(
		readonly element: HTMLElement,
		private readonly getMinimumSize: () => number,
		private readonly onLayout: (size: number) => void,
	) {}

	get minimumSize(): number {
		return this.getMinimumSize();
	}

	get maximumSize(): number {
		return Number.MAX_SAFE_INTEGER;
	}

	layout(size: number): void {
		this.onLayout(size);
	}
}

class StandaloneProductService {
	readonly quality: string;
	[key: string]: unknown;

	constructor() {
		Object.assign(this, product);
		this.quality = typeof product.quality === 'string' ? product.quality : 'stable';
	}
}

registerSingleton(IProductService, StandaloneProductService, false);

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

function joinVaultPath(basePath: string, vaultPath: string): string {
	const segments = vaultPath.split('/').filter(segment => segment.length > 0);
	return segments.length > 0 ? path.join(basePath, ...segments) : basePath;
}

function getRequire(): RequireLike | null {
	const requireFn = (globalThis as typeof globalThis & {
		require?: RequireLike;
	}).require;

	return requireFn ?? null;
}

function readDesktopClipboardText(): string {
	const requireFn = getRequire();
	if (!requireFn) return '';

	const electronModule = requireFn('electron') as {
		clipboard?: { readText: () => string };
	};
	return electronModule.clipboard?.readText() ?? '';
}

function getPluginInstallPath(plugin: MonacoPlugin): string | null {
	const adapter = plugin.app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) {
		return null;
	}

	const basePath = adapter.getBasePath();
	const manifestDir = plugin.manifest.dir?.trim();
	if (manifestDir) {
		return path.isAbsolute(manifestDir) ? manifestDir : path.join(basePath, manifestDir);
	}

	return path.join(basePath, plugin.app.vault.configDir, 'plugins', plugin.manifest.id);
}

function loadNodePty(plugin: MonacoPlugin): NodePtyModule | null {
	if (cachedNodePty !== undefined) {
		return cachedNodePty;
	}

	const requireFn = getRequire();
	if (!requireFn) {
		cachedNodePty = null;
		return cachedNodePty;
	}

	const pluginInstallPath = getPluginInstallPath(plugin);
	const bundledRuntimePath = pluginInstallPath
		? path.join(pluginInstallPath, 'vendor', 'node-pty', 'lib', 'index.js')
		: null;
	try {
		if (!bundledRuntimePath) {
			throw new Error('Plugin install path unavailable');
		}
		cachedNodePty = requireFn(bundledRuntimePath) as NodePtyModule;
		return cachedNodePty;
	} catch (bundledError) {
		try {
			cachedNodePty = requireFn('node-pty') as NodePtyModule;
			return cachedNodePty;
		} catch (moduleError) {
			console.error('[Monaco] Failed to load node-pty runtime.', bundledError, moduleError);
			cachedNodePty = null;
			return cachedNodePty;
		}
	}
}

function readCssVariable(element: HTMLElement, variableName: string, fallback: string): string {
	const value = getComputedStyle(element).getPropertyValue(variableName).trim();
	return value.length > 0 ? value : fallback;
}

export class MonacoView extends FileView {
	private editor: monaco.editor.IStandaloneCodeEditor | null = null;
	private readonly plugin: MonacoPlugin;
	private readonly layoutEl: HTMLDivElement;
	private readonly editorContainer: HTMLDivElement;
	private readonly terminalEl: HTMLDivElement;
	private readonly terminalToggleButtonEl: HTMLButtonElement;
	private readonly terminalPathEl: HTMLSpanElement;
	private readonly terminalStatusEl: HTMLSpanElement;
	private readonly terminalBodyEl: HTMLDivElement;
	private readonly terminalViewportEl: HTMLDivElement;
	private readonly terminalRestartButtonEl: HTMLButtonElement;
	private readonly terminalStopButtonEl: HTMLButtonElement;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private detachPasteFallback: (() => void) | null = null;
	private isTerminalCollapsed = true;
	private isLoading = false;
	private currentWorkingDirectory: string | null = null;
	private currentWorkingDirectoryLabel = '/';
	private terminalInstance: Terminal | null = null;
	private terminalFitAddon: FitAddon | null = null;
	private terminalInputDisposable: XtermDisposable | null = null;
	private terminalResizeObserver: ResizeObserver | null = null;
	private terminalProcess: IPty | null = null;
	private terminalProcessDataDisposable: PtyDisposable | null = null;
	private terminalProcessExitDisposable: PtyDisposable | null = null;
	private terminalShellLabel = '';
	private terminalError: string | null = null;
	private splitView: SplitView | null = null;
	private splitLayoutHeight = 0;
	private terminalExpandedHeight = TERMINAL_DEFAULT_HEIGHT;
	private hasExpandedTerminal = false;
	private scratchModel: monaco.editor.ITextModel | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: MonacoPlugin) {
		super(leaf);
		this.plugin = plugin;

		this.contentEl.addClass('monaco-view-content');
		this.layoutEl = this.contentEl.createDiv({ cls: 'monaco-view-layout' });
		this.editorContainer = this.layoutEl.createDiv({ cls: 'monaco-editor-container' });
		this.terminalEl = this.layoutEl.createDiv({ cls: 'monaco-terminal is-collapsed' });

		const terminalHeaderEl = this.terminalEl.createDiv({ cls: 'monaco-terminal-header' });
		this.terminalToggleButtonEl = terminalHeaderEl.createEl('button', {
			cls: 'monaco-terminal-toggle',
			text: 'Show terminal',
			attr: { type: 'button' },
		});
		const terminalMetaEl = terminalHeaderEl.createDiv({ cls: 'monaco-terminal-meta' });
		this.terminalPathEl = terminalMetaEl.createSpan({
			cls: 'monaco-terminal-path',
			text: 'Current folder: /',
		});
		this.terminalStatusEl = terminalMetaEl.createSpan({
			cls: 'monaco-terminal-status',
			text: 'Idle',
		});
		const terminalActionsEl = terminalHeaderEl.createDiv({ cls: 'monaco-terminal-actions' });
		const clearButtonEl = terminalActionsEl.createEl('button', {
			cls: 'monaco-terminal-action-button',
			text: 'Clear',
			attr: { type: 'button' },
		});
		this.terminalRestartButtonEl = terminalActionsEl.createEl('button', {
			cls: 'monaco-terminal-action-button',
			text: 'Restart',
			attr: { type: 'button' },
		});
		this.terminalStopButtonEl = terminalActionsEl.createEl('button', {
			cls: 'monaco-terminal-action-button',
			text: 'Stop',
			attr: { type: 'button' },
		});

		this.terminalBodyEl = this.terminalEl.createDiv({ cls: 'monaco-terminal-body' });
		this.terminalViewportEl = this.terminalBodyEl.createDiv({ cls: 'monaco-terminal-viewport' });

		this.terminalToggleButtonEl.addEventListener('click', () => {
			this.setTerminalCollapsed(!this.isTerminalCollapsed);
		});
		clearButtonEl.addEventListener('click', () => {
			this.clearTerminal();
		});
		this.terminalRestartButtonEl.addEventListener('click', () => {
			this.restartTerminal();
		});
		this.terminalStopButtonEl.addEventListener('click', () => {
			this.stopTerminal();
		});
		this.terminalViewportEl.addEventListener('mousedown', () => {
			this.terminalInstance?.focus();
		});

		this.initializeSplitView();
		this.updateTerminalUi();
	}

	getViewType(): string {
		return MONACO_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file?.name ?? 'Monaco editor';
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
				this.disposeScratchModel();
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

		this.layoutSplitView();
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		if (!this.file) {
			this.createScratchEditor();
		}
	}

	private createScratchEditor(): void {
		if (this.editor) return;

		ensureMonacoEnvironment();
		ensureMonacoServices();

		const scratchUri = monaco.Uri.parse(`untitled://obsidian-monaco/${++untitledEditorCount}`);
		this.createEditor('', 'plaintext', scratchUri);
		this.scratchModel = monaco.editor.getModel(scratchUri);
	}

	private disposeScratchModel(): void {
		this.scratchModel?.dispose();
		this.scratchModel = null;
	}

	private initializeSplitView(): void {
		const editorPane = new StaticSplitPane(
			this.editorContainer,
			() => EDITOR_MIN_HEIGHT,
			size => {
				this.editorContainer.style.height = `${size}px`;
				this.editor?.layout();
			},
		);
		const terminalPane = new StaticSplitPane(
			this.terminalEl,
			() => this.getTerminalMinimumHeight(),
			size => {
				this.terminalEl.style.height = `${size}px`;
				if (!this.isTerminalCollapsed && size > TERMINAL_COLLAPSED_HEIGHT) {
					this.terminalExpandedHeight = size;
					this.hasExpandedTerminal = true;
				}
				this.fitTerminal();
			},
		);

		this.splitView = new SplitView(this.layoutEl, {
			orientation: 0,
			proportionalLayout: false,
		});
		this.splitView.addView(editorPane, EDITOR_MIN_HEIGHT);
		this.splitView.addView(terminalPane, TERMINAL_COLLAPSED_HEIGHT);

		window.setTimeout(() => {
			this.layoutSplitView();
		}, 0);
	}

	private getTerminalMaximumHeight(totalHeight = this.splitLayoutHeight): number {
		return Math.max(TERMINAL_COLLAPSED_HEIGHT, totalHeight - EDITOR_MIN_HEIGHT);
	}

	private getTerminalMinimumHeight(): number {
		if (this.isTerminalCollapsed) {
			return TERMINAL_COLLAPSED_HEIGHT;
		}

		return Math.max(
			TERMINAL_COLLAPSED_HEIGHT,
			Math.min(TERMINAL_MIN_EXPANDED_HEIGHT, this.getTerminalMaximumHeight()),
		);
	}

	private getTargetTerminalHeight(totalHeight = this.splitLayoutHeight): number {
		const minimumHeight = this.getTerminalMinimumHeight();
		const maximumHeight = this.getTerminalMaximumHeight(totalHeight);

		if (this.isTerminalCollapsed) {
			return Math.min(maximumHeight, TERMINAL_COLLAPSED_HEIGHT);
		}

		return Math.max(minimumHeight, Math.min(maximumHeight, this.terminalExpandedHeight));
	}

	private layoutSplitView(): void {
		if (!this.splitView) return;

		const totalHeight = this.layoutEl.clientHeight || this.contentEl.clientHeight;
		if (totalHeight <= 0) return;

		this.splitLayoutHeight = totalHeight;
		const targetTerminalHeight = this.getTargetTerminalHeight(totalHeight);
		this.splitView.layout(totalHeight);
		this.splitView.resizeView(1, targetTerminalHeight);
	}

	private ensureTerminalInstance(): void {
		if (this.terminalInstance) return;

		const terminal = new Terminal({
			allowTransparency: true,
			cursorBlink: true,
			fontFamily: readCssVariable(this.contentEl, '--font-monospace', 'monospace'),
			fontSize: this.plugin.settings.fontSize,
			scrollback: 5000,
			theme: this.getTerminalTheme(),
		});
		const fitAddon = new FitAddon();
		terminal.loadAddon(fitAddon);
		terminal.open(this.terminalViewportEl);

		this.terminalInputDisposable = terminal.onData(data => {
			this.terminalProcess?.write(data);
		});

		this.terminalResizeObserver = new ResizeObserver(() => {
			this.fitTerminal();
		});
		this.terminalResizeObserver.observe(this.terminalBodyEl);

		this.terminalInstance = terminal;
		this.terminalFitAddon = fitAddon;
	}

	private getTerminalTheme(): ITheme {
		return TERMINAL_THEME_PALETTES[this.plugin.settings.theme];
	}

	private fitTerminal(): { cols: number; rows: number } | null {
		if (!this.terminalInstance || !this.terminalFitAddon || this.isTerminalCollapsed) {
			return null;
		}

		this.terminalFitAddon.fit();
		const cols = Math.max(20, this.terminalInstance.cols);
		const rows = Math.max(5, this.terminalInstance.rows);

		if (this.terminalProcess) {
			this.terminalProcess.resize(cols, rows);
		}

		return { cols, rows };
	}

	private startTerminalIfNeeded(): void {
		if (this.isTerminalCollapsed || this.terminalProcess || !this.currentWorkingDirectory) {
			this.updateTerminalUi();
			return;
		}

		const nodePty = loadNodePty(this.plugin);
		if (!nodePty) {
			this.terminalError = 'Terminal runtime unavailable';
			this.updateTerminalUi();
			return;
		}

		const resolvedShell = resolveTerminalShell(this.plugin.settings);
		if (!resolvedShell) {
			this.terminalError =
				this.plugin.settings.terminalShellProfile === 'git-bash'
					? 'Git Bash was not found'
					: 'Choose a valid shell path';
			this.updateTerminalUi();
			return;
		}

		this.ensureTerminalInstance();
		const dimensions = this.fitTerminal();
		const cols = dimensions?.cols ?? 80;
		const rows = dimensions?.rows ?? 24;
		const terminal = this.terminalInstance;
		if (!terminal) return;

		this.terminalError = null;
		this.terminalShellLabel = resolvedShell.label;
		terminal.writeln(`\x1b[90m[Starting ${resolvedShell.label} in ${this.currentWorkingDirectoryLabel}]\x1b[0m`);

		const env: Record<string, string | undefined> = {
			...process.env,
			TERM: 'xterm-256color',
			COLORTERM: 'truecolor',
		};

		try {
			const terminalProcess = nodePty.spawn(resolvedShell.executable, resolvedShell.args, {
				name: 'xterm-256color',
				cols,
				rows,
				cwd: this.currentWorkingDirectory,
				env,
				useConpty: process.platform === 'win32' ? false : undefined,
			});

			this.terminalProcess = terminalProcess;
			this.terminalProcessDataDisposable = terminalProcess.onData(data => {
				this.terminalInstance?.write(data);
			});
			this.terminalProcessExitDisposable = terminalProcess.onExit(({ exitCode, signal }) => {
				this.terminalProcess = null;
				this.disposeTerminalProcessListeners();
				const exitSummary =
					signal !== undefined
						? `[${this.terminalShellLabel} exited with signal ${signal}]`
						: `[${this.terminalShellLabel} exited with code ${exitCode}]`;
				this.terminalInstance?.writeln(`\r\n\x1b[90m${exitSummary}\x1b[0m`);
				this.updateTerminalUi();
			});

			this.updateTerminalUi();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.terminalError = message;
			this.terminalInstance?.writeln(`\x1b[31m[Failed to start terminal: ${message}]\x1b[0m`);
			this.updateTerminalUi();
		}
	}

	private disposeTerminalProcessListeners(): void {
		this.terminalProcessDataDisposable?.dispose();
		this.terminalProcessDataDisposable = null;
		this.terminalProcessExitDisposable?.dispose();
		this.terminalProcessExitDisposable = null;
	}

	private stopTerminal(): void {
		if (!this.terminalProcess) return;

		this.terminalInstance?.writeln('\r\n\x1b[90m[Stopping terminal]\x1b[0m');
		const processToStop = this.terminalProcess;
		this.terminalProcess = null;
		this.disposeTerminalProcessListeners();
		processToStop.kill();
		this.updateTerminalUi();
	}

	private restartTerminal(): void {
		if (!this.currentWorkingDirectory) {
			new Notice('Monaco terminal is only available for local filesystem vaults.');
			return;
		}

		if (this.terminalProcess) {
			const processToRestart = this.terminalProcess;
			this.terminalProcess = null;
			this.disposeTerminalProcessListeners();
			processToRestart.kill();
		}

		if (!this.isTerminalCollapsed) {
			this.terminalInstance?.writeln('\r\n\x1b[90m[Restarting terminal]\x1b[0m');
		}

		this.startTerminalIfNeeded();
	}

	private clearTerminal(): void {
		this.terminalInstance?.clear();
		if (this.terminalProcess) {
			this.terminalProcess.clear();
		}
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
		const nextWorkingDirectoryLabel = folderPath === '/' ? '/' : `/${folderPath}`;

		if (!(adapter instanceof FileSystemAdapter)) {
			this.currentWorkingDirectory = null;
			this.currentWorkingDirectoryLabel = nextWorkingDirectoryLabel;
			this.terminalPathEl.setText('Current folder: unavailable for this vault');
			if (this.terminalProcess) {
				this.stopTerminal();
			}
			this.updateTerminalUi();
			return;
		}

		const nextWorkingDirectory = joinVaultPath(adapter.getBasePath(), folderPath);
		const directoryChanged =
			this.currentWorkingDirectory !== null && this.currentWorkingDirectory !== nextWorkingDirectory;

		this.currentWorkingDirectory = nextWorkingDirectory;
		this.currentWorkingDirectoryLabel = nextWorkingDirectoryLabel;
		this.terminalPathEl.setText(`Current folder: ${this.currentWorkingDirectoryLabel}`);

		if (directoryChanged && this.terminalProcess) {
			this.restartTerminal();
			return;
		}

		if (!this.isTerminalCollapsed) {
			this.startTerminalIfNeeded();
		}

		this.updateTerminalUi();
	}

	private setTerminalCollapsed(collapsed: boolean): void {
		if (collapsed && !this.isTerminalCollapsed) {
			const currentTerminalHeight = this.splitView?.getViewSize(1) ?? this.terminalEl.clientHeight;
			if (currentTerminalHeight > TERMINAL_COLLAPSED_HEIGHT) {
				this.terminalExpandedHeight = currentTerminalHeight;
				this.hasExpandedTerminal = true;
			}
		} else if (!collapsed && this.isTerminalCollapsed && !this.hasExpandedTerminal) {
			this.terminalExpandedHeight = Math.min(
				TERMINAL_DEFAULT_HEIGHT,
				this.getTerminalMaximumHeight(),
			);
		}

		this.isTerminalCollapsed = collapsed;
		this.terminalEl.classList.toggle('is-collapsed', collapsed);
		this.terminalToggleButtonEl.setText(collapsed ? 'Show terminal' : 'Hide terminal');
		this.updateTerminalUi();
		this.layoutSplitView();

		if (!collapsed) {
			window.setTimeout(() => {
				this.layoutSplitView();
				this.startTerminalIfNeeded();
				this.fitTerminal();
				this.terminalInstance?.focus();
			}, 0);
		}
	}

	private updateTerminalUi(): void {
		if (!this.currentWorkingDirectory) {
			this.terminalStatusEl.setText('Terminal unavailable');
			this.terminalRestartButtonEl.disabled = true;
			this.terminalStopButtonEl.disabled = true;
			return;
		}

		if (this.terminalProcess) {
			this.terminalStatusEl.setText(`Running ${this.terminalShellLabel} in ${this.currentWorkingDirectoryLabel}`);
			this.terminalRestartButtonEl.disabled = false;
			this.terminalStopButtonEl.disabled = false;
			return;
		}

		if (this.terminalError) {
			this.terminalStatusEl.setText(this.terminalError);
			this.terminalRestartButtonEl.disabled = false;
			this.terminalStopButtonEl.disabled = true;
			return;
		}

		this.terminalStatusEl.setText('Idle');
		this.terminalRestartButtonEl.disabled = false;
		this.terminalStopButtonEl.disabled = true;
	}

	applySettings(): void {
		if (this.editor) {
			const { settings } = this.plugin;
			monaco.editor.setTheme(settings.theme);
			this.editor.updateOptions({
				fontSize: settings.fontSize,
				wordWrap: settings.wordWrap,
				minimap: { enabled: settings.minimap },
			});
		}

		if (this.terminalInstance) {
			this.terminalInstance.options.fontFamily = readCssVariable(
				this.contentEl,
				'--font-monospace',
				'monospace',
			);
			this.terminalInstance.options.fontSize = this.plugin.settings.fontSize;
			this.terminalInstance.options.theme = this.getTerminalTheme();
			this.fitTerminal();
		}
	}

	onResize(): void {
		this.layoutSplitView();
	}

	async onClose(): Promise<void> {
		this.flushSave();
		this.stopTerminal();
		this.disposeTerminalProcessListeners();
		this.detachPasteFallback?.();
		this.detachPasteFallback = null;
		this.terminalResizeObserver?.disconnect();
		this.terminalResizeObserver = null;
		this.terminalInputDisposable?.dispose();
		this.terminalInputDisposable = null;
		this.terminalInstance?.dispose();
		this.terminalInstance = null;
		this.terminalFitAddon = null;
		this.splitView?.dispose();
		this.splitView = null;
		if (this.editor) {
			const model = this.editor.getModel();
			if (model && model !== this.scratchModel) {
				model.dispose();
			}
			this.editor.dispose();
			this.editor = null;
		}
		this.disposeScratchModel();
	}
}
