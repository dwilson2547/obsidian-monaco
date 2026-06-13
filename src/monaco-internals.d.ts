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

declare module 'monaco-editor/esm/vs/base/browser/ui/splitview/splitview.js' {
	export interface SplitViewPane {
		readonly element: HTMLElement;
		readonly minimumSize: number;
		readonly maximumSize: number;
		onDidChange(listener: (size: number) => void): { dispose(): void };
		layout(size: number, offset: number, layoutContext?: unknown): void;
		setVisible?(visible: boolean): void;
	}

	export class SplitView {
		constructor(
			container: HTMLElement,
			options?: {
				orientation?: number;
				proportionalLayout?: boolean;
			},
		);

		addView(view: SplitViewPane, size: number, index?: number, skipLayout?: boolean): void;
		layout(size: number, layoutContext?: unknown): void;
		resizeView(index: number, size: number): void;
		getViewSize(index: number): number;
		dispose(): void;
	}
}
