import type { QuickJSAsyncContext, QuickJSContext, Scope } from 'quickjs-emscripten-core';
import type { RuntimeOptions } from '../../types/RuntimeOptions.js';
export declare const provideEnv: (ctx: QuickJSContext | QuickJSAsyncContext, scope: Scope, options: RuntimeOptions) => void;
