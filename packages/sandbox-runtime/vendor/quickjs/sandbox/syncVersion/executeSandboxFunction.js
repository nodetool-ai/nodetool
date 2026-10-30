import { createEvalCodeFunction } from './createEvalCodeFunction.js';
import { createValidateCodeFunction } from './createValidateCodeFunction.js';
export const executeSandboxFunction = async (input) => {
    const { ctx, sandboxOptions, sandboxedFunction, fs, transpileFile } = input;
    const opt = { ctx, sandboxOptions, transpileFile };
    const evalCode = createEvalCodeFunction(opt, input.scope);
    const validateCode = createValidateCodeFunction(opt);
    return await sandboxedFunction({ ctx, evalCode, validateCode, mountedFs: fs });
};
