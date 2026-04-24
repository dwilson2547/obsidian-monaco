declare module 'monaco-editor/esm/vs/platform/product/common/product.js' {
	const product: Record<string, unknown> & {
		quality?: string;
	};

	export default product;
}

declare module 'monaco-editor/esm/vs/editor/standalone/browser/standaloneServices.js' {
	export const StandaloneServices: {
		initialize(overrides: Record<string, unknown>): unknown;
	};
}

declare module 'monaco-editor/esm/vs/platform/instantiation/common/extensions.js' {
	export function registerSingleton(
		id: unknown,
		ctorOrDescriptor: new () => unknown,
		supportsDelayedInstantiation?: boolean,
	): void;
}

declare module 'monaco-editor/esm/vs/platform/product/common/productService.js' {
	export const IProductService: unknown;
}
