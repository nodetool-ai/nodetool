import * as memfsPkg from 'memfs';
import type { RuntimeOptions } from './types/RuntimeOptions.js';
/**
 * Create the virtual file system for the sandbox
 * Creates a node_modules folder with packages and ensures the src folder
 *
 * @param runtimeOptions
 * @returns filesystem fs and volume vol
 */
export declare const createVirtualFileSystem: (runtimeOptions?: RuntimeOptions) => {
    vol: memfsPkg.Volume;
    fs: memfsPkg.IFs;
};
