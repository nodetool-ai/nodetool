import type { QuickJSAsyncContext, QuickJSContext, Scope } from 'quickjs-emscripten-core';
import type { RuntimeOptions } from '../../types/RuntimeOptions.js';
/**
 * Provide all Node.js console methods
 */
export declare const provideConsole: (ctx: QuickJSContext | QuickJSAsyncContext, scope: Scope, options: RuntimeOptions) => void;
