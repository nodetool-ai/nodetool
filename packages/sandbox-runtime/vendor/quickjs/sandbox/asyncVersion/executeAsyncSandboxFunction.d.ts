import type { IFs } from 'memfs';
import type { QuickJSAsyncContext, Scope } from 'quickjs-emscripten-core';
import type { AsyncSandboxFunction } from '../../types/SandboxFunction.js';
import type { SandboxAsyncOptions } from '../../types/SandboxOptions.js';
export declare const executeAsyncSandboxFunction: <T>(input: {
    ctx: QuickJSAsyncContext;
    fs: IFs;
    scope: Scope;
    sandboxOptions: SandboxAsyncOptions;
    sandboxedFunction: AsyncSandboxFunction<T>;
    transpileFile: (input: string) => string;
}) => Promise<T>;
