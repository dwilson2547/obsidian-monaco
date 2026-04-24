/**
 * Maps file extensions (lower-case, without leading dot) to Monaco language IDs.
 * This list covers the languages Monaco ships built-in tokenizers for.
 */
const LANGUAGE_MAP: Record<string, string> = {
	// Web
	ts: 'typescript',
	tsx: 'typescript',
	js: 'javascript',
	jsx: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	mts: 'typescript',
	cts: 'typescript',
	css: 'css',
	less: 'less',
	scss: 'scss',
	html: 'html',
	htm: 'html',
	xml: 'xml',
	svg: 'xml',
	xsl: 'xml',
	// Data / config
	json: 'json',
	jsonc: 'json',
	yaml: 'yaml',
	yml: 'yaml',
	toml: 'ini',
	ini: 'ini',
	cfg: 'ini',
	conf: 'ini',
	env: 'ini',
	// Shell
	sh: 'shell',
	bash: 'shell',
	zsh: 'shell',
	fish: 'shell',
	ps1: 'powershell',
	psm1: 'powershell',
	psd1: 'powershell',
	// Systems / compiled
	c: 'c',
	h: 'c',
	cpp: 'cpp',
	cc: 'cpp',
	cxx: 'cpp',
	hpp: 'cpp',
	hxx: 'cpp',
	cs: 'csharp',
	java: 'java',
	kt: 'kotlin',
	kts: 'kotlin',
	go: 'go',
	rs: 'rust',
	swift: 'swift',
	dart: 'dart',
	// Scripting
	py: 'python',
	rb: 'ruby',
	php: 'php',
	lua: 'lua',
	pl: 'perl',
	pm: 'perl',
	r: 'r',
	// Query / markup
	sql: 'sql',
	graphql: 'graphql',
	gql: 'graphql',
	proto: 'proto',
	tex: 'latex',
	latex: 'latex',
	// Infra / build
	dockerfile: 'dockerfile',
	tf: 'hcl',
	hcl: 'hcl',
	makefile: 'makefile',
	// Docs
	md: 'markdown',
	markdown: 'markdown',
	// Misc
	vue: 'html',
	svelte: 'html',
};

/** Returns the Monaco language ID for a given extension, or 'plaintext'. */
export function getLanguageForExtension(ext: string): string {
	return LANGUAGE_MAP[ext.toLowerCase()] ?? 'plaintext';
}

/** All extensions that have a known Monaco language mapping. */
export const ALL_KNOWN_EXTENSIONS: string[] = Object.keys(LANGUAGE_MAP);

/**
 * Default set of extensions that will be enabled when the plugin is first installed.
 * Excludes .md/.markdown since Obsidian owns those natively.
 */
export function getDefaultEnabledExtensions(): string[] {
	return ALL_KNOWN_EXTENSIONS.filter(e => e !== 'md' && e !== 'markdown');
}
