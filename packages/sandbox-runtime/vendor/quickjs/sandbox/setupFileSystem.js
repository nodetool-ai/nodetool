import { createVirtualFileSystem } from '../createVirtualFileSystem.js';
const isMountedFs = (input) => typeof input === 'object' &&
    input !== null &&
    'readFileSync' in input &&
    typeof input.readFileSync === 'function' &&
    'existsSync' in input &&
    typeof input.existsSync === 'function';
export const setupFileSystem = (runtimeOptions) => {
    if (runtimeOptions.mountFs && isMountedFs(runtimeOptions.mountFs)) {
        return runtimeOptions.mountFs;
    }
    return createVirtualFileSystem(runtimeOptions).fs;
};
