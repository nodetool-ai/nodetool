import { type QuickJSAsyncContext, type QuickJSContext, type QuickJSHandle, Scope } from 'quickjs-emscripten-core';
export declare const getHandle: (scope: Scope, ctx: QuickJSContext | QuickJSAsyncContext, name: string, input: unknown) => QuickJSHandle;
export declare const expose: (ctx: QuickJSContext | QuickJSAsyncContext, _parentScope: Scope, input: Record<string, unknown>, parent?: QuickJSHandle) => void;
