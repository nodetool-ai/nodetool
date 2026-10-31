import type { IFs } from 'memfs';
import type { QuickJSAsyncContext, QuickJSContext, Scope } from 'quickjs-emscripten-core';
import type { RuntimeOptions } from '../../types/RuntimeOptions.js';
/**
 * Provide http related functions
 */
export declare const provideHttp: (ctx: QuickJSContext | QuickJSAsyncContext, scope: Scope, options: RuntimeOptions, input?: {
    fs?: IFs | undefined;
}) => void;
