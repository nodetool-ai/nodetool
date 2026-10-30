import type { IFs } from 'memfs';
import type { JSModuleLoader } from 'quickjs-emscripten-core';
import type { RuntimeOptions } from '../../types/RuntimeOptions.js';
export declare const getModuleLoader: (fs: IFs, _runtimeOptions: RuntimeOptions) => JSModuleLoader;
