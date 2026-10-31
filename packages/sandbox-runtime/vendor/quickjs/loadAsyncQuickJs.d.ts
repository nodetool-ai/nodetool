import type { LoadAsyncQuickJsOptions } from './types/LoadQuickJsOptions.js';
import type { AsyncSandboxFunction } from './types/SandboxFunction.js';
import type { SandboxAsyncOptions } from './types/SandboxOptions.js';
/**
 * Loads the QuickJS async module and returns a sandbox execution function.
 * @param variant - Options for loading the QuickJS module. Defaults to '@jitl/quickjs-ng-wasmfile-release-asyncify'.
 * @returns An object containing the runSandboxed function and the loaded module.
 */
export declare const loadAsyncQuickJs: (variant: LoadAsyncQuickJsOptions) => Promise<{
    runSandboxed: <T>(sandboxedFunction: AsyncSandboxFunction<T>, sandboxOptions?: SandboxAsyncOptions) => Promise<T>;
    module: import("quickjs-emscripten-core").QuickJSAsyncWASMModule;
}>;
