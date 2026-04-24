import { App, PluginSettingTab, Setting } from 'obsidian';
import type MonacoPlugin from './main';
import { ALL_KNOWN_EXTENSIONS, getDefaultEnabledExtensions } from './languageMap';

export interface MonacoPluginSettings {
	/** File extensions (without leading dot) that should open in Monaco. */
	enabledExtensions: string[];
	/** Monaco editor colour theme. */
	theme: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light';
	/** Editor font size in pixels. */
	fontSize: number;
	/** Line-wrapping behaviour. */
	wordWrap: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
	/** Whether the minimap overview rail is visible. */
	minimap: boolean;
	/** Extensions discovered by the last "Scan Vault" run. */
	vaultExtensions: string[];
}

export const DEFAULT_SETTINGS: MonacoPluginSettings = {
	enabledExtensions: getDefaultEnabledExtensions(),
	theme: 'vs-dark',
	fontSize: 14,
	wordWrap: 'off',
	minimap: true,
	vaultExtensions: [],
};

export class MonacoSettingTab extends PluginSettingTab {
	plugin: MonacoPlugin;

	constructor(app: App, plugin: MonacoPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Monaco Editor' });

		// ── Editor appearance ──────────────────────────────────────────────────

		new Setting(containerEl)
			.setName('Theme')
			.setDesc('Colour theme used inside the Monaco editor.')
			.addDropdown(dd =>
				dd
					.addOptions({
						'vs': 'Light',
						'vs-dark': 'Dark',
						'hc-black': 'High Contrast Dark',
						'hc-light': 'High Contrast Light',
					})
					.setValue(this.plugin.settings.theme)
					.onChange(async value => {
						this.plugin.settings.theme = value as MonacoPluginSettings['theme'];
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Font size')
			.setDesc('Editor font size in pixels (10 – 32).')
			.addSlider(sl =>
				sl
					.setLimits(10, 32, 1)
					.setValue(this.plugin.settings.fontSize)
					.setDynamicTooltip()
					.onChange(async value => {
						this.plugin.settings.fontSize = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Word wrap')
			.setDesc('Controls how long lines are wrapped inside the editor.')
			.addDropdown(dd =>
				dd
					.addOptions({
						'off': 'Off',
						'on': 'On',
						'wordWrapColumn': 'At wrap column',
						'bounded': 'Bounded',
					})
					.setValue(this.plugin.settings.wordWrap)
					.onChange(async value => {
						this.plugin.settings.wordWrap = value as MonacoPluginSettings['wordWrap'];
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Minimap')
			.setDesc('Show the minimap overview rail on the right side of the editor.')
			.addToggle(tg =>
				tg
					.setValue(this.plugin.settings.minimap)
					.onChange(async value => {
						this.plugin.settings.minimap = value;
						await this.plugin.saveSettings();
					})
			);

		// ── File-type routing ──────────────────────────────────────────────────

		containerEl.createEl('h3', { text: 'File types' });
		containerEl.createEl('p', {
			text:
				'Toggle which file extensions should be opened with Monaco. ' +
				'Use "Scan vault" to discover every extension present in your vault ' +
				'and add any unknown ones to the list. ' +
				'Changes take effect the next time a file of that type is opened ' +
				'(already-open tabs are not affected).',
			cls: 'setting-item-description',
		});

		new Setting(containerEl)
			.setName('Scan vault')
			.setDesc('Detect all file extensions currently in the vault and add them to the list below.')
			.addButton(btn =>
				btn
					.setButtonText('Scan vault')
					.setCta()
					.onClick(async () => {
						await this.plugin.scanVaultExtensions();
						this.display();
					})
			);

		// Merge known-supported extensions with vault-discovered ones
		const allExtensions = new Set([
			...ALL_KNOWN_EXTENSIONS,
			...this.plugin.settings.vaultExtensions,
		]);
		// Obsidian owns .md natively – exclude it
		allExtensions.delete('md');
		allExtensions.delete('markdown');

		const sorted = Array.from(allExtensions).sort();

		containerEl.createEl('h4', { text: 'Enabled extensions' });

		for (const ext of sorted) {
			const enabled = this.plugin.settings.enabledExtensions.includes(ext);
			new Setting(containerEl)
				.setName(`.${ext}`)
				.addToggle(tg =>
					tg.setValue(enabled).onChange(async value => {
						if (value) {
							if (!this.plugin.settings.enabledExtensions.includes(ext)) {
								this.plugin.settings.enabledExtensions.push(ext);
							}
						} else {
							this.plugin.settings.enabledExtensions =
								this.plugin.settings.enabledExtensions.filter(e => e !== ext);
						}
						await this.plugin.saveSettings();
						this.plugin.updateRegisteredExtensions();
					})
				);
		}
	}
}
