import type { QuickJSAsyncContext } from 'quickjs-emscripten-core';
import type { SandboxAsyncOptions } from '../../types/SandboxOptions.js';
export declare const prepareAsyncNodeCompatibility: (vm: QuickJSAsyncContext, sandboxOptions: SandboxAsyncOptions) => Promise<void>;
