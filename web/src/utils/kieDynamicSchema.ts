/**
 * Kie.ai dynamic schema resolution via backend.
 * POSTs model_info (pasted kie.ai API documentation) to the app backend;
 * backend parses the markdown and returns dynamic_properties, dynamic_inputs,
 * and dynamic_outputs.
 */

export interface KieDynamicInputMetadata {
  type: string;
  type_args?: unknown[];
  optional?: boolean;
  description?: string;
  values?: (string | number)[] | null;
  type_name?: string | null;
  min?: number;
  max?: number;
  default?: unknown;
}

export interface ResolvedKieSchema {
  dynamic_properties: Record<string, unknown>;
  dynamic_inputs?: Record<string, KieDynamicInputMetadata>;
  dynamic_outputs: Record<
    string,
    { type: string; type_args?: unknown[]; optional?: boolean }
  >;
  model_id?: string;
}

/**
 * Resolve Kie.ai dynamic schema via backend.
 * User pastes the full kie.ai API documentation for a model.
 *
 * @param modelInfo - Pasted kie.ai API documentation markdown
 * @param apiBaseUrl - Backend base URL (e.g. from BASE_URL); use "" for same-origin
 */
export async function resolveKieSchemaClient(
  modelInfo: string,
  apiBaseUrl: string = ""
): Promise<ResolvedKieSchema> {
  const raw = (modelInfo ?? "").trim();
  if (!raw) {
    throw new Error("Paste kie.ai API documentation to load the schema.");
  }

  const base = apiBaseUrl || "";
  const url = `${base}/api/kie/resolve-dynamic-schema`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_info: raw })
  });

  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const json = JSON.parse(text) as { detail?: string };
      message = json.detail ?? text;
    } catch {
      // use text as-is
    }
    if (res.status === 501) {
      throw new Error(
        "Kie.ai schema resolution requires the backend with nodetool-base installed."
      );
    }
    if (res.status === 400) {
      throw new Error(message || "Invalid model_info");
    }
    throw new Error(
      message || `Failed to load schema: ${res.status} ${res.statusText}`
    );
  }

  const data = (await res.json()) as {
    model_id?: string;
    dynamic_properties: Record<string, unknown>;
    dynamic_inputs?: Record<string, KieDynamicInputMetadata>;
    dynamic_outputs: Record<
      string,
      { type: string; type_args?: unknown[]; optional?: boolean }
    >;
  };
  return {
    dynamic_properties: data.dynamic_properties ?? {},
    dynamic_inputs: data.dynamic_inputs ?? {},
    dynamic_outputs: data.dynamic_outputs ?? {},
    model_id: data.model_id
  };
}
