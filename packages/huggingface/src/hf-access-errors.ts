/**
 * User-facing explanations for Hugging Face Hub auth / gated-repo failures.
 */

export function looksLikeHfHubAccessError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("restricted") ||
    m.includes("authenticated") ||
    m.includes("please log in") ||
    m.includes("paths-info") ||
    m.includes("not authorized") ||
    m.includes("unauthorized") ||
    m.includes("401") ||
    m.includes("403") ||
    m.includes("gated") ||
    m.includes("access to model") ||
    m.includes("invalid credentials")
  );
}

/**
 * If {@link looksLikeHfHubAccessError} matches, prepend concrete recovery steps
 * so downloads surface actionable guidance (HF Hub errors are often terse).
 */
export function augmentHfHubAccessError(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || !looksLikeHfHubAccessError(trimmed)) {
    return trimmed;
  }

  return [
    "Hugging Face blocked this download (missing permission, missing token, or the repo is gated/private).",
    "",
    "What to do:",
    "1. On huggingface.co, open this model while signed in. Accept the license or click Request access and wait if it is gated.",
    "2. Authenticate the Hub client NodeTool uses: set environment variable HF_TOKEN (read token) before starting the NodeTool server, or run `huggingface-cli login` / `hf auth login` once so a token is saved in your user HF cache.",
    "3. Create or manage tokens: https://huggingface.co/settings/tokens",
    "4. Restart the NodeTool server after changing HF_TOKEN.",
    "",
    "Original message:",
    trimmed
  ].join("\n");
}
