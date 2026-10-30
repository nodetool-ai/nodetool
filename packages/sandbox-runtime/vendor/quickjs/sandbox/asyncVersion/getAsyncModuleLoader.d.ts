import type { IFs } from 'memfs';
import type { JSModuleLoaderAsync } from 'quickjs-emscripten-core';
import type { RuntimeOptions } from '../../types/RuntimeOptions.js';
export declare const getAsyncModuleLoader: (fs: IFs, _runtimeOptions: RuntimeOptions) => JSModuleLoaderAsync;
