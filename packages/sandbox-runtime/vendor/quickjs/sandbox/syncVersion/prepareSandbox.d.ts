import type { IFs } from 'memfs';
import type { QuickJSContext, Scope } from 'quickjs-emscripten-core';
import type { SandboxBaseOptions } from '../../types/SandboxOptions.js';
export declare const prepareSandbox: (ctx: QuickJSContext, scope: Scope, sandboxOptions: SandboxBaseOptions, fs: IFs) => void;
