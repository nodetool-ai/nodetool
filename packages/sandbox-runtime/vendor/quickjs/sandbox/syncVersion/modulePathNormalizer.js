import { join, resolve } from 'node:path';
export const modulePathNormalizer = (baseName, requestedName) => {
    // relative import
    if (requestedName.startsWith('.')) {
        const parts = baseName.split('/');
        parts.pop();
        return resolve(`/${parts.join('/')}`, requestedName);
    }
    // module import
    const moduleName = requestedName.replace('node:', '');
    return join('/node_modules', moduleName);
};
