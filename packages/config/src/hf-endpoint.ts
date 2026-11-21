/**
 * The Hugging Face Hub host that model downloads and Hub API calls use.
 *
 * `HF_ENDPOINT` is the variable the official `huggingface_hub` library reads,
 * so a mirror such as https://hf-mirror.com configured for Python tools also
 * applies here. The default is the public Hub.
 */

export const DEFAULT_HF_ENDPOINT = "https://huggingface.co";

/**
 * Resolve the Hub host. Precedence: `override` (a stored `HF_ENDPOINT`
 * setting) > the `HF_ENDPOINT` environment variable > the public Hub. The
 * result has no trailing slash.
 */
export function resolveHfEndpoint(override?: string | null): string {
  const raw =
    override?.trim() || process.env["HF_ENDPOINT"]?.trim() || DEFAULT_HF_ENDPOINT;
  return stripTrailingSlashes(raw);
}

/**
 * Remove trailing `/` characters. A loop rather than `/\/+$/`, which
 * backtracks quadratically on a long run of slashes.
 */
export function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(0, end);
}

/**
 * Move a fixed `https://huggingface.co/...` file URL onto `endpoint`. URLs on
 * any other host are returned unchanged, so a URL the user typed for another
 * host is never rewritten.
 */
export function rewriteHfHubUrl(url: string, endpoint?: string | null): string {
  const target = resolveHfEndpoint(endpoint);
  if (target === DEFAULT_HF_ENDPOINT) return url;
  const prefix = `${DEFAULT_HF_ENDPOINT}/`;
  return url.startsWith(prefix) ? `${target}/${url.slice(prefix.length)}` : url;
}
