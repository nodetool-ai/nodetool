import type { LanguageModel } from "../stores/ApiTypes";

export type NormalizedModelMeta = {
  sizeB?: number; // billions of params
  sizeBucket?: "1-2B" | "3-7B" | "8-15B" | "16-34B" | "35-70B" | "70B+";
  typeTags: string[]; // ["instruct","chat","base","sft","dpo","reasoning","code","math"]
  family?: string; // llama, qwen, mistral, gemma, phi, yi, deepseek, qwq, granite
  moe?: string; // e.g., 8x7B
};

const bucketSizeByB = (b?: number) => {
  if (b == null) return undefined;
  if (b <= 2) return "1-2B";
  if (b <= 7) return "3-7B";
  if (b <= 15) return "8-15B";
  if (b <= 34) return "16-34B";
  if (b <= 70) return "35-70B";
  return "70B+";
};

// removed context and quant/modality normalization for now per request

export function normalizeModelMeta(m: LanguageModel): NormalizedModelMeta {
  const text = `${m.name ?? ""} ${m.id ?? ""}`.toLowerCase();

  const typeTags = [
    /instruct/.test(text) && "instruct",
    /\bchat\b/.test(text) && "chat",
    /\bbase\b/.test(text) && "base",
    /\bsft\b/.test(text) && "sft",
    /\bdpo\b/.test(text) && "dpo",
    /(reason|r1|qwq)/.test(text) && "reasoning",
    /(code|coder)/.test(text) && "code",
    /\bmath\b/.test(text) && "math"
  ].filter(Boolean) as string[];

  const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(b|m)\b/);
  const sizeB = sizeMatch
    ? sizeMatch[2] === "m"
      ? parseFloat(sizeMatch[1]) / 1000
      : parseFloat(sizeMatch[1])
    : undefined;

  // context, modality, quant removed

  const familyMatch = text.match(
    /\b(llama|mistral|mixtral|qwen|gemma|phi|yi|deepseek|qwq|granite)\b/
  );
  const family = familyMatch ? familyMatch[1].toLowerCase() : undefined;

  const moeMatch = text.match(/(\d+)\s*[x×]\s*(\d+)\s*b/);
  const moe = moeMatch ? `${moeMatch[1]}x${moeMatch[2]}B` : undefined;

  return {
    sizeB,
    sizeBucket: bucketSizeByB(sizeB),
    typeTags,
    family,
    moe
  };
}

export function buildMetaIndex(models: LanguageModel[]) {
  return models.map((m) => ({ model: m, meta: normalizeModelMeta(m) }));
}
