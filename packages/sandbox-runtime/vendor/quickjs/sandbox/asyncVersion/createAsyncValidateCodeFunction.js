import { handleEvalError } from '../handleEvalError.js';
export const createAsyncValidateCodeFunction = (input) => {
    const { ctx } = input;
    return async (code, filename = '/src/index.js', evalOptions) => {
        try {
            ctx
                .unwrapResult(await ctx.evalCodeAsync(code, filename, {
                strict: true,
                strip: true,
                backtraceBarrier: true,
                ...evalOptions,
                type: 'module',
                compileOnly: true,
            }))
                .dispose();
            return { ok: true };
        }
        catch (err) {
            return handleEvalError(err);
        }
    };
};
