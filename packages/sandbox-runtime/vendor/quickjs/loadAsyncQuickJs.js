import { newQuickJSAsyncWASMModuleFromVariant, Scope, shouldInterruptAfterDeadline } from 'quickjs-emscripten-core';
import { executeAsyncSandboxFunction } from './sandbox/asyncVersion/executeAsyncSandboxFunction.js';
import { getAsyncModuleLoader } from './sandbox/asyncVersion/getAsyncModuleLoader.js';
import { modulePathNormalizerAsync } from './sandbox/asyncVersion/modulePathNormalizerAsync.js';
import { prepareAsyncNodeCompatibility } from './sandbox/asyncVersion/prepareAsyncNodeCompatibility.js';
import { prepareAsyncSandbox } from './sandbox/asyncVersion/prepareAsyncSandbox.js';
import { setupFileSystem } from './sandbox/setupFileSystem.js';
/**
 * Loads the QuickJS async module and returns a sandbox execution function.
 * @param variant - Options for loading the QuickJS module. Defaults to '@jitl/quickjs-ng-wasmfile-release-asyncify'.
 * @returns An object containing the runSandboxed function and the loaded module.
 */
export const loadAsyncQuickJs = async (variant) => {
    const module = await newQuickJSAsyncWASMModuleFromVariant(variant);
    /**
     * Provides a new sandbox and executes the given function.
     * When the function has been finished, the sandbox gets disposed and can longer be used.
     *
     * @param sandboxedFunction
     * @param sandboxOptions
     * @returns
     */
    const runSandboxed = async (sandboxedFunction, sandboxOptions = {}) => {
        const scope = new Scope();
        let ctx;
        try {
            ctx = scope.manage(module.newContext());
            if (sandboxOptions.executionTimeout) {
                ctx.runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + sandboxOptions.executionTimeout));
            }
            if (sandboxOptions.maxStackSize) {
                ctx.runtime.setMaxStackSize(sandboxOptions.maxStackSize);
            }
            if (sandboxOptions.memoryLimit) {
                ctx.runtime.setMemoryLimit(sandboxOptions.memoryLimit);
            }
            // Virtual File System,
            const fs = setupFileSystem(sandboxOptions);
            const transpileFile = (value) => value;
            // JS Module Loader
            const moduleLoader = sandboxOptions.getModuleLoader
                ? sandboxOptions.getModuleLoader(fs, sandboxOptions)
                : getAsyncModuleLoader(fs, sandboxOptions);
            ctx.runtime.setModuleLoader(moduleLoader, sandboxOptions.modulePathNormalizer ?? modulePathNormalizerAsync);
            // Register Globals to be more Node.js compatible
            await prepareAsyncNodeCompatibility(ctx, sandboxOptions);
            // Prepare the Sandbox
            // Expose Data and Functions to Client
            prepareAsyncSandbox(ctx, scope, sandboxOptions, fs);
            // Run the given Function
            const result = await executeAsyncSandboxFunction({
                ctx,
                fs,
                scope,
                sandboxOptions,
                sandboxedFunction,
                transpileFile,
            });
            return result;
        }
        finally {
            scope.dispose();
        }
    };
    return { runSandboxed, module };
};
