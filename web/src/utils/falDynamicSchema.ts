/**
 * FAL dynamic schema resolution via backend.
 * POSTs model_info (pasted OpenAPI JSON, llms.txt, URL, or endpoint id) to the
 * app backend to avoid CORS; backend returns dynamic_properties and dynamic_outputs.
 */

export interface DynamicInputMetadata {
  type: string;
  type_args?: unknown[];
  optional?: boolean;
  description?: string;
  values?: (string | number)[] | null;
  type_name?: string | null;
}

export interface ResolvedFalSchema {
  dynamic_properties: Record<string, unknown>;
  dynamic_inputs?: Record<string, DynamicInputMetadata>;
  dynamic_outputs: Record<
    string,
    { type: string; type_args?: unknown[]; optional?: boolean }
  >;
  endpoint_id?: string;
}

function sanitizeEndpointId(value: string): string {
  return value
    .trim()
    .replace(/[)\]}>.,;:]+$/, "") // Removed unnecessary escape
    .trim();
}

/**
 * Normalize user input (URL, endpoint id, or path) to a fal.ai endpoint id
 * suitable for the OpenAPI URL.
 */
export function modelInfoToEndpointId(modelInfo: string): string | null {
  const raw = (modelInfo ?? "").trim();
  if (!raw) {return null;}

  // Already looks like endpoint id (e.g. "fal-ai/flux-2/klein/4b/base/edit")
  if (raw.includes("/") && !raw.includes(" ") && !raw.startsWith("http")) {
    return sanitizeEndpointId(raw);
  }

  // fal.ai model URL -> extract path after /models/
  if (
    raw.startsWith("http") &&
    raw.includes("fal.ai") &&
    raw.includes("/models/")
  ) {
    try {
      const u = new URL(raw);
      if (u.pathname.startsWith("/models/")) {
        const path = u.pathname
          .replace(/^\/models\/?,?/, "")
          .replace(/\/?$/, "");
        const id = path || u.pathname.replace("/models/", "");
        return sanitizeEndpointId(id);
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Resolve FAL dynamic schema via backend (uses base URL to avoid CORS).
 * Accepts pasted OpenAPI JSON, llms.txt, fal.ai URL, or endpoint id.
 *
 * @param modelInfo - Pasted OpenAPI JSON, llms.txt content, fal.ai URL, or endpoint id
 * @param apiBaseUrl - Backend base URL (e.g. from BASE_URL); use "" for same-origin
 */
export async function resolveFalSchemaClient(
  modelInfo: string,
  apiBaseUrl: string = ""
): Promise<ResolvedFalSchema> {
  const raw = (modelInfo ?? "").trim();
  if (!raw) {
    throw new Error(
      "Paste OpenAPI JSON, llms.txt, a fal.ai URL, or an endpoint id (e.g. fal-ai/.../model-name)"
    );
  }

  const base = apiBaseUrl || "";
  const url = `${base}/api/fal/resolve-dynamic-schema`;
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
        "FAL schema resolution requires the backend with nodetool-fal installed."
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
    endpoint_id?: string;
    dynamic_properties: Record<string, unknown>;
    dynamic_inputs?: Record<string, DynamicInputMetadata>;
    dynamic_outputs: Record<
      string,
      { type: string; type_args?: unknown[]; optional?: boolean }
    >;
  };
  return {
    dynamic_properties: data.dynamic_properties ?? {},
    dynamic_inputs: data.dynamic_inputs ?? {},
    dynamic_outputs: data.dynamic_outputs ?? {},
    endpoint_id: data.endpoint_id
  };
}
