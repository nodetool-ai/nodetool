import useModelPreferencesStore from "../stores/ModelPreferencesStore";

const MODEL_TYPES = new Set([
  "language_model",
  "image_model",
  "embedding_model",
  "tts_model",
  "asr_model",
  "video_model"
]);

interface PropertyMeta {
  name: string;
  type: { type: string } | string;
}

function getTypeString(type: { type: string } | string): string {
  return typeof type === "string" ? type : type.type;
}

export function applyDefaultModels(
  properties: Record<string, unknown>,
  propertyMetadata: PropertyMeta[]
): Record<string, unknown> {
  const defaults = useModelPreferencesStore.getState().defaults;
  console.log("[applyDefaultModels] store defaults:", defaults);
  if (Object.keys(defaults).length === 0) {
    console.log("[applyDefaultModels] no defaults configured, skipping");
    return properties;
  }

  const result = { ...properties };

  for (const prop of propertyMetadata) {
    const modelType = getTypeString(prop.type);
    if (!MODEL_TYPES.has(modelType)) continue;

    const current = result[prop.name] as
      | Record<string, unknown>
      | null
      | undefined;
    const isEmpty =
      !current ||
      current.provider === "empty" ||
      current.provider === "" ||
      current.id === "";

    const userDefault = defaults[modelType];
    console.log(
      `[applyDefaultModels] prop=${prop.name} modelType=${modelType} isEmpty=${isEmpty} hasDefault=${!!userDefault}`,
      "current:",
      current,
      "default:",
      userDefault
    );
    if (isEmpty && userDefault) {
      result[prop.name] = {
        type: modelType,
        provider: userDefault.provider,
        id: userDefault.id,
        name: userDefault.name
      };
    }
  }

  return result;
}
