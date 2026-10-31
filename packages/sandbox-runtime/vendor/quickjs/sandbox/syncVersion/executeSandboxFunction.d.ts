import type { IFs } from 'memfs';
import type { QuickJSContext, Scope } from 'quickjs-emscripten-core';
import type { SandboxFunction } from '../../types/SandboxFunction.js';
import type { SandboxOptions } from '../../types/SandboxOptions.js';
export declare const executeSandboxFunction: <T>(input: {
    ctx: QuickJSContext;
    fs: IFs;
    scope: Scope;
    sandboxOptions: SandboxOptions;
    sandboxedFunction: SandboxFunction<T>;
    transpileFile: (input: string) => string;
}) => Promise<T>;
