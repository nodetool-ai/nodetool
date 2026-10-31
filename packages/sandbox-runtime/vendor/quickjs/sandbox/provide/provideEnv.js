import { expose } from '../expose/expose.js';
export const provideEnv = (ctx, scope, options) => {
    expose(ctx, scope, {
        env: options.env ?? {},
        process: {
            env: options.env ?? { NODE_DEBUG: 'true' },
            cwd: () => '/',
        },
    });
};
