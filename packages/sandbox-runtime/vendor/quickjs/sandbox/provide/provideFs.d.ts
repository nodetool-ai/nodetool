import type { IFs } from 'memfs';
import type { QuickJSAsyncContext, QuickJSContext, Scope } from 'quickjs-emscripten-core';
import type { RuntimeOptions } from '../../types/RuntimeOptions.js';
export declare const provideFs: (ctx: QuickJSContext | QuickJSAsyncContext, scope: Scope, runtimeOptions: RuntimeOptions, fs: IFs) => void;
