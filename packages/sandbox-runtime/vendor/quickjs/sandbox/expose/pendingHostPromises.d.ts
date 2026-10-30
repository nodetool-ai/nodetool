import type { QuickJSAsyncContext, QuickJSContext, QuickJSDeferredPromise } from 'quickjs-emscripten-core';
type ContextType = QuickJSContext | QuickJSAsyncContext;
export declare const registerPendingHostPromise: (ctx: ContextType, promise: QuickJSDeferredPromise) => void;
export declare const unregisterPendingHostPromise: (ctx: ContextType, promise: QuickJSDeferredPromise) => void;
export declare const rejectAndFlushPendingHostPromises: (ctx: ContextType, message?: string, maxWaitMs?: number) => Promise<void>;
export {};
