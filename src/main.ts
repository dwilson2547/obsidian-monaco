import { Notice, Plugin, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, MonacoPluginSettings, MonacoSettingTab } from './settings';
import { MONACO_VIEW_TYPE, MonacoView } from './monacoView';

type ViewRegistryLike = {
	typeByExtension: Record<string, string>;
};

type AppWithViewRegistry = Plugin['app'] & {
	viewRegistry?: ViewRegistryLike;
};

function normalizeExtensions(extensions: string[]): string[] {
	return Array.from(
		new Set(
			extensions
				.map(ext => ext.trim().toLowerCase())
				.filter(ext => ext.length > 0 && ext !== 'md' && ext !== 'markdown'),
		),
	);
}

export default class MonacoPlugin extends Plugin {
	settings!: MonacoPluginSettings;

	/**
	 * Extensions currently routed to the Monaco view.
	 */
	private registeredExtensions: string[] = [];
	private readonly originalExtensionTypes = new Map<string, string | undefined>();

	// ── Plugin lifecycle ─────────────────────────────────────────────────────

	async onload(): Promise<void> {
		await this.loadSettings();

		// Register the Monaco view factory
		this.registerView(MONACO_VIEW_TYPE, leaf => new MonacoView(leaf, this));

		// Wire file extensions → Monaco view
		this.syncRegisteredExtensions();

		// Settings tab
		this.addSettingTab(new MonacoSettingTab(this.app, this));
	}

	onunload(): void {
		this.restoreRegisteredExtensions();
	}

	// ── Extension registration ───────────────────────────────────────────────

	private getTypeByExtension(): Record<string, string> | null {
		return ((this.app as AppWithViewRegistry).viewRegistry?.typeByExtension) ?? null;
	}

	private restoreExtension(
		typeByExtension: Record<string, string>,
		ext: string,
	): void {
		if (typeByExtension[ext] === MONACO_VIEW_TYPE) {
			const originalType = this.originalExtensionTypes.get(ext);
			if (originalType) {
				typeByExtension[ext] = originalType;
			} else {
				delete typeByExtension[ext];
			}
		}

		this.originalExtensionTypes.delete(ext);
	}

	private syncRegisteredExtensions(): void {
		const typeByExtension = this.getTypeByExtension();
		const next = normalizeExtensions(this.settings.enabledExtensions);
		this.settings.enabledExtensions = next;

		if (!typeByExtension) {
			this.registeredExtensions = [];
			return;
		}

		const nextSet = new Set(next);
		for (const ext of this.registeredExtensions) {
			if (!nextSet.has(ext)) {
				this.restoreExtension(typeByExtension, ext);
			}
		}

		for (const ext of next) {
			const currentType = typeByExtension[ext];
			if (currentType !== MONACO_VIEW_TYPE) {
				this.originalExtensionTypes.set(ext, currentType);
				typeByExtension[ext] = MONACO_VIEW_TYPE;
			}
		}

		this.registeredExtensions = next;
	}

	private restoreRegisteredExtensions(): void {
		const typeByExtension = this.getTypeByExtension();
		if (!typeByExtension) return;

		for (const ext of this.registeredExtensions) {
			this.restoreExtension(typeByExtension, ext);
		}
		this.registeredExtensions = [];
	}

	/**
	 * Dynamically update which extensions are routed to Monaco without requiring
	 * a full plugin reload.
	 */
	updateRegisteredExtensions(): void {
		this.syncRegisteredExtensions();
		new Notice('Monaco: file-type settings updated. Re-open files to apply changes.');
	}

	// ── Vault scanner ────────────────────────────────────────────────────────

	/** Scan the entire vault, collect all distinct extensions, and persist them. */
	async scanVaultExtensions(): Promise<void> {
		const found = new Set<string>();
		for (const file of this.app.vault.getFiles()) {
			const ext = file.extension?.toLowerCase();
			if (ext && ext !== 'md') {
				found.add(ext);
			}
		}
		this.settings.vaultExtensions = Array.from(found).sort();
		await this.saveSettings();
		new Notice(`Monaco: found ${found.size} file type${found.size !== 1 ? 's' : ''} in vault.`);
	}

	// ── Settings persistence ─────────────────────────────────────────────────

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<MonacoPluginSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...loaded,
			enabledExtensions: normalizeExtensions(loaded?.enabledExtensions ?? DEFAULT_SETTINGS.enabledExtensions),
			vaultExtensions: normalizeExtensions(loaded?.vaultExtensions ?? DEFAULT_SETTINGS.vaultExtensions),
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Push appearance changes to all currently open Monaco editors
		this.app.workspace.getLeavesOfType(MONACO_VIEW_TYPE).forEach(leaf => {
			(leaf.view as MonacoView).applySettings();
		});
	}
}
