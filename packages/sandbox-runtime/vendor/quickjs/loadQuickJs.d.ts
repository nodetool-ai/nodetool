import type { LoadQuickJsOptions } from './types/LoadQuickJsOptions.js';
import type { SandboxFunction } from './types/SandboxFunction.js';
import type { SandboxOptions } from './types/SandboxOptions.js';
/**
 * Loads the QuickJS module and returns a sandbox execution function.
 * @param variant - Options for loading the QuickJS module. Defaults to '@jitl/quickjs-ng-wasmfile-release-sync'.
 * @returns An object containing the runSandboxed function and the loaded module.
 */
export declare const loadQuickJs: (variant: LoadQuickJsOptions) => Promise<{
    runSandboxed: <T>(sandboxedFunction: SandboxFunction<T>, sandboxOptions?: SandboxOptions) => Promise<T>;
    module: import("quickjs-emscripten-core").QuickJSWASMModule;
}>;
