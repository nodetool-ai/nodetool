import type { QuickJSAsyncContext, QuickJSContext, QuickJSHandle } from 'quickjs-emscripten-core';
export declare const call: (ctx: QuickJSContext | QuickJSAsyncContext, fileName: string, code: string, that: QuickJSHandle | undefined, ...args: QuickJSHandle[]) => QuickJSHandle;
