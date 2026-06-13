import path from 'path';
import { existsSync } from 'fs';
import process from 'process';
import { App, PluginSettingTab, Setting } from 'obsidian';
import type MonacoPlugin from './main';
import { ALL_KNOWN_EXTENSIONS, getDefaultEnabledExtensions } from './languageMap';

export type TerminalShellProfile =
	| 'auto'
	| 'powershell'
	| 'cmd'
	| 'git-bash'
	| 'bash'
	| 'zsh'
	| 'sh'
	| 'custom';

export interface ResolvedTerminalShell {
	executable: string;
	args: string[];
	label: string;
	key: string;
}

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
	/** Which terminal shell profile to use for the integrated terminal. */
	terminalShellProfile: TerminalShellProfile;
	/** Custom shell executable path, used when profile is custom. */
	terminalCustomShellPath: string;
	/** Custom shell arguments, used when profile is custom. */
	terminalCustomShellArgs: string;
}

export const DEFAULT_SETTINGS: MonacoPluginSettings = {
	enabledExtensions: getDefaultEnabledExtensions(),
	theme: 'vs-dark',
	fontSize: 14,
	wordWrap: 'off',
	minimap: true,
	vaultExtensions: [],
	terminalShellProfile: 'auto',
	terminalCustomShellPath: '',
	terminalCustomShellArgs: '',
};

type ShellEnvironment = Record<string, string | undefined>;

function findGitBashPath(env: ShellEnvironment): string | null {
	const candidates = [
		env['PROGRAMFILES'] ? path.join(env['PROGRAMFILES'], 'Git', 'bin', 'bash.exe') : null,
		env['PROGRAMFILES(X86)']
			? path.join(env['PROGRAMFILES(X86)'], 'Git', 'bin', 'bash.exe')
			: null,
		env['LOCALAPPDATA']
			? path.join(env['LOCALAPPDATA'], 'Programs', 'Git', 'bin', 'bash.exe')
			: null,
	];

	for (const candidate of candidates) {
		if (candidate && existsSync(candidate)) {
			return candidate;
		}
	}

	return null;
}

function unquoteArgument(value: string): string {
	if (value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
	}

	if (value.startsWith("'") && value.endsWith("'")) {
		return value.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
	}

	return value.replace(/\\(["'\\ ])/g, '$1');
}

export function parseShellArguments(value: string): string[] {
	const matches = value.match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|[^\s]+/g);
	if (!matches) return [];
	return matches.map(unquoteArgument);
}

function resolveWindowsShell(profile: TerminalShellProfile, env: ShellEnvironment): ResolvedTerminalShell | null {
	switch (profile) {
		case 'auto':
		case 'powershell':
			return {
				executable: 'powershell.exe',
				args: ['-NoLogo'],
				label: 'PowerShell',
				key: 'powershell',
			};
		case 'cmd':
			return {
				executable: 'cmd.exe',
				args: [],
				label: 'Command Prompt',
				key: 'cmd',
			};
		case 'git-bash': {
			const gitBashPath = findGitBashPath(env);
			if (!gitBashPath) {
				return null;
			}

			return {
				executable: gitBashPath,
				args: ['--login', '-i'],
				label: 'Git Bash',
				key: `git-bash:${gitBashPath}`,
			};
		}
		case 'custom':
		case 'bash':
		case 'zsh':
		case 'sh':
			return null;
	}
}

function resolvePosixShell(profile: TerminalShellProfile, env: ShellEnvironment): ResolvedTerminalShell {
	if (profile === 'auto') {
		const shellPath = env.SHELL?.trim();
		if (shellPath) {
			return {
				executable: shellPath,
				args: ['-i'],
				label: path.basename(shellPath) || shellPath,
				key: `auto:${shellPath}`,
			};
		}
	}

	const executable = profile === 'auto' ? 'bash' : profile;
	return {
		executable,
		args: ['-i'],
		label: executable,
		key: executable,
	};
}

export function resolveTerminalShell(
	settings: MonacoPluginSettings,
	platform = process.platform,
	env: ShellEnvironment = process.env as ShellEnvironment,
): ResolvedTerminalShell | null {
	if (settings.terminalShellProfile === 'custom') {
		const executable = settings.terminalCustomShellPath.trim();
		if (!executable) {
			return null;
		}

		return {
			executable,
			args: parseShellArguments(settings.terminalCustomShellArgs),
			label: path.basename(executable) || executable,
			key: `custom:${executable}:${settings.terminalCustomShellArgs}`,
		};
	}

	if (platform === 'win32') {
		return resolveWindowsShell(settings.terminalShellProfile, env);
	}

	return resolvePosixShell(settings.terminalShellProfile, env);
}

export class MonacoSettingTab extends PluginSettingTab {
	plugin: MonacoPlugin;

	constructor(app: App, plugin: MonacoPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName('Editor').setHeading();

		new Setting(containerEl)
			.setName('Theme')
			.setDesc('Color theme used inside the editor.')
			.addDropdown(dd =>
				dd
					.addOptions({
						'vs': 'Light',
						'vs-dark': 'Dark',
						'hc-black': 'High contrast dark',
						'hc-light': 'High contrast light',
					})
					.setValue(this.plugin.settings.theme)
					.onChange(async value => {
						this.plugin.settings.theme = value as MonacoPluginSettings['theme'];
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Font size')
			.setDesc('Editor font size in pixels (10 - 32).')
			.addSlider(sl =>
				sl
					.setLimits(10, 32, 1)
					.setValue(this.plugin.settings.fontSize)
					.setDynamicTooltip()
					.onChange(async value => {
						this.plugin.settings.fontSize = value;
						await this.plugin.saveSettings();
					}),
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
					}),
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
					}),
			);

		new Setting(containerEl).setName('Integrated terminal').setHeading();

		new Setting(containerEl)
			.setName('Shell profile')
			.setDesc('Choose the shell to launch for the integrated terminal.')
			.addDropdown(dd =>
				dd
					.addOptions({
						'auto': 'Automatic',
						'powershell': 'PowerShell (Windows)',
						'cmd': 'Command Prompt (Windows)',
						'git-bash': 'Git Bash (Windows)',
						'bash': 'bash (macOS/Linux)',
						'zsh': 'zsh (macOS/Linux)',
						'sh': 'sh (macOS/Linux)',
						'custom': 'Custom path',
					})
					.setValue(this.plugin.settings.terminalShellProfile)
					.onChange(async value => {
						this.plugin.settings.terminalShellProfile =
							value as MonacoPluginSettings['terminalShellProfile'];
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		new Setting(containerEl)
			.setName('Custom shell path')
			.setDesc('Used only when the shell profile is set to custom path.')
			.addText(text =>
				text
					.setPlaceholder('/bin/bash or C:\\Program Files\\Git\\bin\\bash.exe')
					.setValue(this.plugin.settings.terminalCustomShellPath)
					.setDisabled(this.plugin.settings.terminalShellProfile !== 'custom')
					.onChange(async value => {
						this.plugin.settings.terminalCustomShellPath = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Custom shell arguments')
			.setDesc('Used only when the shell profile is set to custom path. Quote arguments that contain spaces.')
			.addText(text =>
				text
					.setPlaceholder('--login -i')
					.setValue(this.plugin.settings.terminalCustomShellArgs)
					.setDisabled(this.plugin.settings.terminalShellProfile !== 'custom')
					.onChange(async value => {
						this.plugin.settings.terminalCustomShellArgs = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName('File types').setHeading();

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
					}),
			);

		const allExtensions = new Set([
			...ALL_KNOWN_EXTENSIONS,
			...this.plugin.settings.vaultExtensions,
		]);
		allExtensions.delete('md');
		allExtensions.delete('markdown');

		const sorted = Array.from(allExtensions).sort();

		new Setting(containerEl).setName('Enabled extensions').setHeading();

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
					}),
				);
		}
	}
}
