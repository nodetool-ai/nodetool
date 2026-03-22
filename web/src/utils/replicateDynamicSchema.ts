/**
 * Replicate dynamic schema resolution via backend.
 * POSTs model_info (model identifier or URL) to the app backend;
 * backend fetches the Replicate model schema and returns
 * dynamic_properties, dynamic_inputs, and dynamic_outputs.
 */

export interface ReplicateDynamicInputMetadata {
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

export interface ResolvedReplicateSchema {
  dynamic_properties: Record<string, unknown>;
  dynamic_inputs?: Record<string, ReplicateDynamicInputMetadata>;
  dynamic_outputs: Record<
    string,
    { type: string; type_args?: unknown[]; optional?: boolean }
  >;
  model_id?: string;
}

/**
 * Resolve Replicate dynamic schema via backend.
 * User pastes a model identifier (e.g. runwayml/gen-4.5) or URL.
 *
 * @param modelInfo - Model identifier or Replicate URL
 * @param apiBaseUrl - Backend base URL (e.g. from BASE_URL); use "" for same-origin
 */
export async function resolveReplicateSchemaClient(
  modelInfo: string,
  apiBaseUrl: string = ""
): Promise<ResolvedReplicateSchema> {
  const raw = (modelInfo ?? "").trim();
  if (!raw) {
    throw new Error(
      "Paste a Replicate model identifier (e.g. runwayml/gen-4.5) to load the schema."
    );
  }

  const base = apiBaseUrl || "";
  const url = `${base}/api/replicate/resolve-dynamic-schema`;
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
        "Replicate schema resolution requires the backend with nodetool-replicate installed."
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
    dynamic_inputs?: Record<string, ReplicateDynamicInputMetadata>;
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
