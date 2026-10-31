export const handleEvalError = (err) => {
    return err instanceof Error
        ? {
            ok: false,
            error: {
                name: err.name,
                message: err.message,
                stack: err.stack,
            },
            isSyntaxError: err.name === 'SyntaxError',
        }
        : {
            ok: false,
            error: {
                name: 'UnknownError',
                message: typeof err === 'string' ? err : 'An unknown error occurred.',
                stack: '',
            },
            isSyntaxError: false,
        };
};
