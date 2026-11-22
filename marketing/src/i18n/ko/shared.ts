/**
 * Lines several Korean pages share. They follow the English wording and the
 * /ko overview (data/languagePages.ts). ChatGPT, Claude and Gemini plan
 * sign-in is available in Korea and Hugging Face is directly reachable, so
 * unlike the Chinese pages these need no regional settings.
 */

export const LOCAL_RUNTIMES = "Ollama, MLX, llama.cpp, vLLM, LM Studio";

/** The providers the English pricing page names for bring-your-own-keys. */
export const KEY_PROVIDERS = "FAL, KIE, OpenAI, Anthropic, Gemini, Replicate";

export const AGGREGATORS = "fal.ai, Kie.ai, Replicate, Together AI";

export const PLAN_LINE =
  "Studio에서 ChatGPT 또는 Claude로 로그인하면 에이전트가 API 키 대신 그 구독으로 실행됩니다. ChatGPT와 Gemini 플랜은 이미지도 생성하고, Gemini는 동영상도 생성합니다. 이 실행은 플랜의 사용 한도에 포함됩니다.";

export const COST_LINE = "Studio는 무료입니다. 프로바이더가 공개한 가격으로 프로바이더에 직접 결제하며, 내 키를 쓰면 NodeTool은 추가 요금을 붙이지 않습니다.";

export const OPEN_SOURCE_LINE = "무료 오픈소스(AGPL-3.0)입니다. macOS, Windows, Linux에서 실행됩니다.";

/** Settings > General > Appearance. The app UI is machine translated and partial. */
export const UI_LANGUAGE_LINE =
  "설정 → 일반 → 외관에서 표시 언어를 한국어로 바꿀 수 있습니다. 번역은 기계 번역이라 아직 영어로 표시되는 화면도 있습니다. 문서는 영어입니다.";
