import axios, { AxiosError } from "axios";

// Where to read an optional Hugging Face token from. We look at the
// following places in order:
//   1. environment variable injected at build-time (e.g. Vite/CRA)
//   2. browser localStorage key `hf_token`
// This allows advanced users to provide their own access token to bypass
// gated or rate-limited models while keeping the public build working
// anonymously.
function getHfToken(): string | undefined {
  if (typeof process !== "undefined" && process.env?.REACT_APP_HF_API_TOKEN) {
    return process.env.REACT_APP_HF_API_TOKEN;
  }
  if (typeof window !== "undefined") {
    return localStorage.getItem("hf_token") ?? undefined;
  }
  return undefined;
}

export async function fetchHuggingFaceRepoInfo(repoId: string): Promise<any> {
  const url = `https://huggingface.co/api/models/${repoId}`;

  try {
    const { data } = await axios.get(url, { timeout: 8000 });
    return data;
  } catch (err) {
    const e = err as AxiosError;
    // If unauthenticated (401/403) retry once with a token if we have one
    if (
      (e.response?.status === 401 || e.response?.status === 403) &&
      getHfToken()
    ) {
      try {
        const { data } = await axios.get(url, {
          headers: { Authorization: `Bearer ${getHfToken()}` },
          timeout: 8000
        });
        return data;
      } catch {
        /* swallow and fall through */
      }
    }
    // On any failure return null so UI can degrade gracefully
    return null;
  }
}
