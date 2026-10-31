import type { IFs } from 'memfs';
import type { QuickJSAsyncContext, Scope } from 'quickjs-emscripten-core';
import type { SandboxBaseOptions } from '../../types/SandboxOptions.js';
export declare const prepareAsyncSandbox: (ctx: QuickJSAsyncContext, scope: Scope, sandboxOptions: SandboxBaseOptions, fs: IFs) => void;
