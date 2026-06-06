/**
 * Default base URLs for local OpenAI-compatible / Ollama servers.
 *
 * These are the out-of-the-box ports the respective tools listen on. They are
 * used only as the final fallback after an explicit option, the secret store,
 * and the environment variable have all been consulted.
 */

/** Standard Ollama daemon port. */
export const OLLAMA_DEFAULT_URL = "http://127.0.0.1:11434";

/** Standard LM Studio OpenAI-compatible server port. */
export const LMSTUDIO_DEFAULT_URL = "http://127.0.0.1:1234";
