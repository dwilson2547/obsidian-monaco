import { Notice, Plugin, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, MonacoPluginSettings, MonacoSettingTab } from './settings';
import { MONACO_VIEW_TYPE, MonacoView } from './monacoView';

export default class MonacoPlugin extends Plugin {
	settings!: MonacoPluginSettings;

	/**
	 * Extensions currently wired to the Monaco view in the Obsidian viewRegistry.
	 * Tracked here so we can remove/re-add them when the user changes settings.
	 */
	private registeredExtensions: string[] = [];

	// ── Plugin lifecycle ─────────────────────────────────────────────────────

	async onload(): Promise<void> {
		await this.loadSettings();

		// Register the Monaco view factory
		this.registerView(MONACO_VIEW_TYPE, leaf => new MonacoView(leaf, this));

		// Wire file extensions → Monaco view
		this.registerEnabledExtensions();

		// Settings tab
		this.addSettingTab(new MonacoSettingTab(this.app, this));
	}

	onunload(): void {
		// Obsidian automatically removes registered extensions and views on unload
	}

	// ── Extension registration ───────────────────────────────────────────────

	private registerEnabledExtensions(): void {
		const exts = this.settings.enabledExtensions.filter(e => e.length > 0);
		if (exts.length > 0) {
			this.registerExtensions(exts, MONACO_VIEW_TYPE);
			this.registeredExtensions = [...exts];
		}
	}

	/**
	 * Dynamically update which extensions are routed to Monaco without requiring
	 * a full plugin reload.  Accesses the internal viewRegistry map directly
	 * since the public API only exposes additive registration.
	 */
	updateRegisteredExtensions(): void {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const typeByExtension: Record<string, string> = (this.app as any).viewRegistry?.typeByExtension ?? {};

		// Remove previously registered extensions
		for (const ext of this.registeredExtensions) {
			if (typeByExtension[ext] === MONACO_VIEW_TYPE) {
				delete typeByExtension[ext];
			}
		}

		// Register updated set
		const next = this.settings.enabledExtensions.filter(e => e.length > 0);
		for (const ext of next) {
			typeByExtension[ext] = MONACO_VIEW_TYPE;
		}
		this.registeredExtensions = next;

		new Notice('Monaco: file-type settings updated. Re-open files to apply changes.');
	}

	// ── Vault scanner ────────────────────────────────────────────────────────

	/** Scan the entire vault, collect all distinct extensions, and persist them. */
	async scanVaultExtensions(): Promise<void> {
		const found = new Set<string>();
		for (const file of this.app.vault.getFiles() as TFile[]) {
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
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MonacoPluginSettings>,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Push appearance changes to all currently open Monaco editors
		this.app.workspace.getLeavesOfType(MONACO_VIEW_TYPE).forEach(leaf => {
			(leaf.view as MonacoView).applySettings();
		});
	}
}
