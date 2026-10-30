import { createAsyncEvalCodeFunction } from './createAsyncEvalCodeFunction.js';
import { createAsyncValidateCodeFunction } from './createAsyncValidateCodeFunction.js';
export const executeAsyncSandboxFunction = async (input) => {
    const { ctx, sandboxOptions, sandboxedFunction, fs, transpileFile } = input;
    const opt = { ctx, sandboxOptions, transpileFile };
    const evalCode = createAsyncEvalCodeFunction(opt, input.scope);
    const validateCode = createAsyncValidateCodeFunction(opt);
    return await sandboxedFunction({ ctx, evalCode, validateCode, mountedFs: fs });
};
