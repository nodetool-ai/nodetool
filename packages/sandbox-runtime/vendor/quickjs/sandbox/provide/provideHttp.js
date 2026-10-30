import { getDefaultFetchAdapter } from '../../adapter/fetch.js';
import { expose } from '../expose/expose.js';
/**
 * Provide http related functions
 */
export const provideHttp = (ctx, scope, options, input) => {
    const injectUnsupported = (name) => () => {
        throw new Error(`Not supported: ${name} has been disabled for security reasons or is not supported by the runtime`);
    };
    let fetchFunction = Object.assign(injectUnsupported('fetch'), {
        preconnect: async (_url, _options) => {
            return;
        },
    });
    if (options.allowFetch) {
        const adapter = options.fetchAdapter ?? getDefaultFetchAdapter({ fs: input?.fs });
        fetchFunction = Object.assign(adapter, {
            preconnect: async (_url, _options) => {
                return;
            },
        });
    }
    expose(ctx, scope, {
        __parseURL: (input, base) => {
            const url = new URL(input, base);
            return {
                href: url.href,
                origin: url.origin,
                protocol: url.protocol,
                username: url.username,
                password: url.password,
                host: url.host,
                hostname: url.hostname,
                port: url.port,
                pathname: url.pathname,
                hash: url.hash,
                search: url.search,
            };
        },
        fetch: fetchFunction,
    });
};
