import { type QuickJSAsyncContext, type QuickJSContext } from 'quickjs-emscripten-core';
export declare const provideTimingFunctions: (ctx: QuickJSContext | QuickJSAsyncContext, max: {
    maxTimeoutCount: number;
    maxIntervalCount: number;
}) => {
    dispose: () => void;
};
