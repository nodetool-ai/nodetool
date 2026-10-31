import { type QuickJSAsyncContext, type QuickJSContext, type QuickJSHandle, Scope } from 'quickjs-emscripten-core';
/**
 * Serialize data from guest to host
 *
 * @param ctx The sandbox context
 * @param handle The QuickJS handle to serialize
 * @returns
 */
export declare const handleToNative: (ctx: QuickJSContext | QuickJSAsyncContext, handle: QuickJSHandle, rootScope?: Scope) => any;
