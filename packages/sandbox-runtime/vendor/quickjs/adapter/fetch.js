import { RateLimiterMemory } from 'rate-limiter-flexible';
const DISALLOW_HOSTS_DEFAULT = ['localhost', '127.0.0.1'];
const DEFAULT_TIMEOUT = 5000; // 5 seconds
const DEFAULT_RATE_LIMIT_POINTS = 10; // Number of requests
const DEFAULT_RATE_LIMIT_DURATION = 1; // Per second
const HEADERS_MARKER = '__quickjsHeadersObject__';
/**
 * Map a fetch Response to a simplified response object
 * @param res The original response
 * @returns The mapped response object
 */
const createHeadersObject = (headers) => ({
    [HEADERS_MARKER]: true,
    _headers: Object.fromEntries(headers.entries()),
});
/**
 * Map a fetch Response to a simplified response object
 * @param res The original response
 * @returns The mapped response object
 */
const mapResponse = (res) => ({
    status: res.status,
    ok: res.ok,
    statusText: res.statusText,
    json: () => res.json(),
    text: () => res.text(),
    formData: () => res.formData(),
    headers: createHeadersObject(res.headers),
    type: res.type,
    url: res.url,
    blob: () => res.blob(),
    bodyUsed: res.bodyUsed,
    redirected: res.redirected,
    body: undefined,
    arrayBuffer: () => res.arrayBuffer(),
    clone: () => res.clone(),
    bytes: res.bytes,
});
/**
 * Create a 403 forbidden response
 * @returns A 403 forbidden response
 */
const getForbiddenResponse = () => {
    const res = new Response('', { status: 403, statusText: 'FORBIDDEN' });
    return mapResponse(res);
};
/**
 * Create a default fetch adapter
 * @param adapterOptions Options for creating the fetch adapter
 * @returns A fetch adapter function
 */
export const getDefaultFetchAdapter = (adapterOptions = {}) => {
    const options = {
        allowedProtocols: ['http:', 'https:'],
        disallowedHosts: adapterOptions.disallowedHosts ?? DISALLOW_HOSTS_DEFAULT,
        timeout: adapterOptions.timeout ?? DEFAULT_TIMEOUT,
        corsCheck: adapterOptions.corsCheck ?? false,
        allowedCorsOrigins: adapterOptions.allowedCorsOrigins ?? ['*'],
        rateLimitPoints: adapterOptions.rateLimitPoints ?? DEFAULT_RATE_LIMIT_POINTS,
        rateLimitDuration: adapterOptions.rateLimitDuration ?? DEFAULT_RATE_LIMIT_DURATION,
        ...adapterOptions,
    };
    const rateLimiter = new RateLimiterMemory({
        points: options.rateLimitPoints,
        duration: options.rateLimitDuration,
    });
    const fetchAdapter = Object.assign(async (input, init) => {
        try {
            await rateLimiter.consume('fetch', 1);
            let urlString;
            if (typeof input === 'string') {
                urlString = input;
            }
            else if (input instanceof URL) {
                urlString = input.toString();
            }
            else {
                urlString = input.url;
            }
            const parsedUrl = new URL(urlString);
            // Check disallowed hosts
            if (options.disallowedHosts.includes(parsedUrl.hostname)) {
                return getForbiddenResponse();
            }
            // Check allowed hosts
            if (options.allowedHosts && !options.allowedHosts.includes(parsedUrl.hostname)) {
                return getForbiddenResponse();
            }
            // Check allowed protocols
            if (!options.allowedProtocols.includes(parsedUrl.protocol)) {
                return getForbiddenResponse();
            }
            // Handle file:// protocol with virtual file system
            if (parsedUrl.protocol === 'file:') {
                if (!options.fs) {
                    return getForbiddenResponse();
                }
                const filePath = parsedUrl.pathname;
                if (!options.fs.existsSync(filePath)) {
                    const res = new Response('', { status: 404, statusText: 'NOT_FOUND' });
                    return mapResponse(res);
                }
                const content = options.fs.readFileSync(filePath);
                const res = new Response(content, { status: 200, statusText: 'OK' });
                return mapResponse(res);
            }
            // Setup request with timeout
            const initWithDefaults = {
                redirect: 'error',
                ...init,
                signal: AbortSignal.timeout(options.timeout),
            };
            const res = await fetch(input, initWithDefaults);
            // Enforce CORS policy if needed
            if (options.corsCheck) {
                const origin = res.headers.get('Access-Control-Allow-Origin');
                if (!origin || (!options.allowedCorsOrigins.includes('*') && !options.allowedCorsOrigins.includes(origin))) {
                    return getForbiddenResponse();
                }
            }
            return mapResponse(res);
        }
        catch (err) {
            if (err instanceof Error) {
                console.error('Fetch adapter error:', err);
                const res = new Response('', { status: 500, statusText: 'INTERNAL SERVER ERROR' });
                return mapResponse(res);
            }
            const res = new Response('', { status: 429, statusText: 'TOO MANY REQUESTS' });
            return mapResponse(res);
        }
    }, {
        // Dummy implementation of preconnect for Bun compatibility
        preconnect: async (_url, _options) => {
            return;
        },
    });
    return fetchAdapter;
};
export { HEADERS_MARKER };
