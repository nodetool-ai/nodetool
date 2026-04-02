/**
 * RunPod API Module
 *
 * Provides a clean interface to RunPod's REST and GraphQL APIs for managing
 * templates and endpoints. Handles authentication, request/response processing,
 * and error handling for all RunPod operations.
 *
 * Key Features:
 * - Template management (create, update, delete, get)
 * - Endpoint management (create, update, delete)
 * - Network volume management
 * - GraphQL query support
 * - Proper error handling and logging
 */

const RUNPOD_REST_BASE_URL = "https://rest.runpod.io/v1";

/** Escape a string for safe interpolation inside a GraphQL quoted string. */
function gqlEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
const HTTP_STATUS_UNAUTHORIZED = 401;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** GPU types available in RunPod using their official GPU ID codes. */
export enum GPUType {
  // Ada Lovelace Architecture
  ADA_24 = "ADA_24",
  ADA_32_PRO = "ADA_32_PRO",
  ADA_48_PRO = "ADA_48_PRO",
  ADA_80_PRO = "ADA_80_PRO",

  // Ampere Architecture
  AMPERE_16 = "AMPERE_16",
  AMPERE_24 = "AMPERE_24",
  AMPERE_48 = "AMPERE_48",
  AMPERE_80 = "AMPERE_80",

  // Hopper Architecture
  HOPPER_141 = "HOPPER_141"
}

/** Compute types for RunPod endpoints. */
export enum ComputeType {
  CPU = "CPU",
  GPU = "GPU"
}

/** CPU flavor IDs for RunPod endpoints. */
export enum CPUFlavor {
  CPU_3C = "cpu3c",
  CPU_3G = "cpu3g",
  CPU_5C = "cpu5c",
  CPU_5G = "cpu5g"
}

/** Data center locations for RunPod endpoints. */
export enum DataCenter {
  // United States
  US_CALIFORNIA_2 = "US-CA-2",
  US_DELAWARE_1 = "US-DE-1",
  US_GEORGIA_1 = "US-GA-1",
  US_GEORGIA_2 = "US-GA-2",
  US_ILLINOIS_1 = "US-IL-1",
  US_KANSAS_2 = "US-KS-2",
  US_KANSAS_3 = "US-KS-3",
  US_NORTH_CAROLINA_1 = "US-NC-1",
  US_TEXAS_1 = "US-TX-1",
  US_TEXAS_3 = "US-TX-3",
  US_TEXAS_4 = "US-TX-4",
  US_WASHINGTON_1 = "US-WA-1",

  // Canada
  CA_MONTREAL_1 = "CA-MTL-1",
  CA_MONTREAL_2 = "CA-MTL-2",
  CA_MONTREAL_3 = "CA-MTL-3",

  // Europe
  EU_CZECH_REPUBLIC_1 = "EU-CZ-1",
  EU_FRANCE_1 = "EU-FR-1",
  EU_NETHERLANDS_1 = "EU-NL-1",
  EU_ROMANIA_1 = "EU-RO-1",
  EU_SWEDEN_1 = "EU-SE-1",

  // Europe Extended
  EUR_ICELAND_1 = "EUR-IS-1",
  EUR_ICELAND_2 = "EUR-IS-2",
  EUR_ICELAND_3 = "EUR-IS-3",
  EUR_NORWAY_1 = "EUR-NO-1",

  // Asia-Pacific
  AP_JAPAN_1 = "AP-JP-1",

  // Oceania
  OC_AUSTRALIA_1 = "OC-AU-1"
}

/** CUDA versions available in RunPod. */
export enum CUDAVersion {
  CUDA_11_8 = "11.8",
  CUDA_12_0 = "12.0",
  CUDA_12_1 = "12.1",
  CUDA_12_2 = "12.2",
  CUDA_12_3 = "12.3",
  CUDA_12_4 = "12.4",
  CUDA_12_5 = "12.5",
  CUDA_12_6 = "12.6",
  CUDA_12_7 = "12.7",
  CUDA_12_8 = "12.8"
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return all values of a string enum. */
export function enumValues<T extends Record<string, string>>(e: T): string[] {
  return Object.values(e);
}

/** Print available options for an enum. */
export function printEnumOptions<T extends Record<string, string>>(
  enumObj: T,
  title: string
): void {
  console.log(`\n${title}:`);
  for (const value of Object.values(enumObj)) {
    console.log(`  ${value}`);
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.RUNPOD_API_KEY;
  if (!key) {
    throw new Error("RUNPOD_API_KEY environment variable is not set");
  }
  return key;
}

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

export interface GraphQLResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

/**
 * Run a GraphQL query against the RunPod API.
 */
export async function runGraphqlQuery(
  query: string
): Promise<Record<string, unknown>> {
  const apiUrlBase = process.env.RUNPOD_API_BASE_URL ?? "https://api.runpod.io";
  const url = `${apiUrlBase}/graphql`;
  const apiKey = getApiKey();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000)
  });

  if (response.status === HTTP_STATUS_UNAUTHORIZED) {
    throw new Error("Unauthorized request, please check your API key.");
  }

  const json = (await response.json()) as GraphQLResponse;

  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0].message);
  }

  return json as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// REST API helper
// ---------------------------------------------------------------------------

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Make a REST API call to RunPod.
 *
 * @param endpoint - The API endpoint (e.g., "endpoints", "templates")
 * @param method   - HTTP method
 * @param data     - Request body for POST/PUT/PATCH
 * @returns API response data, or empty object for DELETE 204 responses
 */
export async function makeRunpodApiCall(
  endpoint: string,
  method: HttpMethod = "GET",
  data?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const url = `${RUNPOD_REST_BASE_URL}/${endpoint}`;
  const apiKey = getApiKey();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9"
  };

  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(60_000)
  };

  if (data && (method === "POST" || method === "PUT" || method === "PATCH")) {
    init.body = JSON.stringify(data);
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    console.error("RunPod API call failed:", err);
    throw err;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`RunPod API call failed: ${response.status}`);
    if (body) {
      console.error("Response body:", body);
    }
    throw new Error(
      `RunPod API ${method} ${endpoint} failed with status ${response.status}: ${body}`
    );
  }

  // DELETE 204 may have no body
  if (method === "DELETE" && response.status === 204) {
    return {};
  }

  const text = await response.text();
  if (!text) {
    return {};
  }

  return JSON.parse(text) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Network Volume Management
// ---------------------------------------------------------------------------

/**
 * Create a new network volume.
 */
export async function createNetworkVolume(
  name: string,
  size: number,
  dataCenterId: string
): Promise<Record<string, unknown>> {
  return makeRunpodApiCall("networkvolumes", "POST", {
    dataCenterId,
    name,
    size
  });
}

/**
 * List all network volumes.
 */
export async function listNetworkVolumes(): Promise<Record<string, unknown>> {
  return makeRunpodApiCall("networkvolumes", "GET");
}

/**
 * Get details of a specific network volume.
 */
export async function getNetworkVolume(
  volumeId: string
): Promise<Record<string, unknown>> {
  return makeRunpodApiCall(`networkvolumes/${volumeId}`, "GET");
}

/**
 * Update a network volume.
 */
export async function updateNetworkVolume(
  volumeId: string,
  name?: string,
  size?: number
): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {};
  if (name != null) data.name = name;
  if (size != null) data.size = size;
  return makeRunpodApiCall(`networkvolumes/${volumeId}`, "PATCH", data);
}

// ---------------------------------------------------------------------------
// Template Management
// ---------------------------------------------------------------------------

/**
 * Get a RunPod template by name.
 */
export async function getRunpodTemplateByName(
  templateName: string
): Promise<Record<string, unknown> | null> {
  try {
    const result = await makeRunpodApiCall("templates", "GET");

    const templates: Record<string, unknown>[] = Array.isArray(result)
      ? result
      : ((result.templates as Record<string, unknown>[]) ?? []);

    for (const tpl of templates) {
      if (tpl.name === templateName) {
        return tpl;
      }
    }
    return null;
  } catch (err) {
    console.error(`Error fetching template '${templateName}':`, err);
    return null;
  }
}

/**
 * Delete a RunPod template by name.
 */
export async function deleteRunpodTemplateByName(
  templateName: string
): Promise<boolean> {
  try {
    const template = await getRunpodTemplateByName(templateName);
    if (!template) {
      console.log(`Template '${templateName}' not found (may not exist)`);
      return true;
    }

    const templateId = template.id as string;
    await makeRunpodApiCall(`templates/${templateId}`, "DELETE");
    console.log(
      `Template '${templateName}' (ID: ${templateId}) deleted successfully`
    );
    return true;
  } catch (err) {
    console.error(`Error deleting template '${templateName}':`, err);
    return false;
  }
}

/**
 * Update an existing RunPod template with a new Docker image.
 */
export async function updateRunpodTemplate(
  templateData: Record<string, unknown>,
  imageName: string,
  tag: string
): Promise<boolean> {
  try {
    const templateId = templateData.id as string;
    const env = (templateData.env as Record<string, string>) ?? {};
    env.PORT = "8000";
    env.PORT_HEALTH = "8000";

    const updateData: Record<string, unknown> = {
      containerDiskInGb: templateData.containerDiskInGb ?? 20,
      imageName: `${imageName}:${tag}`,
      name: templateData.name,
      ports: templateData.ports ?? ["8000/http"],
      volumeInGb: templateData.volumeInGb ?? 0,
      volumeMountPath: templateData.volumeMountPath ?? "/workspace",
      isPublic: templateData.isPublic ?? false,
      env
    };

    if (templateData.dockerEntrypoint) {
      updateData.dockerEntrypoint = templateData.dockerEntrypoint;
    }
    if (templateData.dockerStartCmd) {
      updateData.dockerStartCmd = templateData.dockerStartCmd;
    }
    if (templateData.readme) {
      updateData.readme = templateData.readme;
    }

    console.log("Updating template with data:");
    console.log(JSON.stringify(updateData, null, 2));

    await makeRunpodApiCall(`templates/${templateId}`, "PATCH", updateData);
    console.log(
      `Template '${templateData.name}' updated with image: ${imageName}:${tag}`
    );
    return true;
  } catch (err) {
    console.error("Error updating template:", err);
    return false;
  }
}

/**
 * Create or update a RunPod template with the latest Docker image.
 *
 * Checks if a template with the given name exists:
 * - If it exists, updates it with the new Docker image
 * - If it doesn't exist, creates a new template
 *
 * @returns The template ID
 */
export async function createOrUpdateRunpodTemplate(
  templateName: string,
  imageName: string,
  tag: string,
  env?: Record<string, string>
): Promise<string> {
  const envVars = env ?? {};

  console.log(`Checking for existing template: ${templateName}`);
  const existing = await getRunpodTemplateByName(templateName);

  if (existing) {
    const templateId = existing.id as string;
    console.log(`Found existing template (ID: ${templateId})`);
    console.log(`Current image: ${existing.imageName ?? "unknown"}`);
    console.log(`Updating with new image: ${imageName}:${tag}`);

    if (await updateRunpodTemplate(existing, imageName, tag)) {
      console.log(`Template '${templateName}' updated successfully`);
      return templateId;
    }
    throw new Error(`Failed to update template '${templateName}'`);
  }

  // Create new template
  console.log(`Template not found, creating new template: ${templateName}`);

  const templateData: Record<string, unknown> = {
    containerDiskInGb: 20,
    imageName: `${imageName}:${tag}`,
    name: templateName,
    ports: ["8000/http", "22/ssh"],
    volumeInGb: 0,
    volumeMountPath: "/workspace",
    isPublic: false,
    env: envVars
  };

  console.log("Creating template with data:");
  console.log(JSON.stringify(templateData, null, 2));

  const result = await makeRunpodApiCall("templates", "POST", templateData);
  const templateId = result.id as string | undefined;

  if (!templateId) {
    console.error("Error: No template ID returned");
    console.error(`Response data: ${JSON.stringify(result, null, 2)}`);
    throw new Error("No template ID returned from RunPod API");
  }

  console.log(`Template created successfully: ${templateId}`);
  return templateId;
}

// ---------------------------------------------------------------------------
// Endpoint Management
// ---------------------------------------------------------------------------

/**
 * Get a RunPod endpoint by name.
 */
export async function getRunpodEndpointByName(
  endpointName: string,
  quiet = false
): Promise<Record<string, unknown> | null> {
  const endpointsResponse = await makeRunpodApiCall("endpoints", "GET");

  const endpoints: Record<string, unknown>[] = Array.isArray(endpointsResponse)
    ? endpointsResponse
    : ((endpointsResponse.endpoints as Record<string, unknown>[]) ?? []);

  if (!quiet) {
    console.log(`Looking for endpoint: '${endpointName}'`);
    console.log(`Found ${endpoints.length} total endpoints`);
  }

  if (endpoints.length > 0 && !quiet) {
    console.log("Available endpoints:");
    endpoints.forEach((ep, i) => {
      const name = (ep.name as string) ?? "<no name>";
      const id = (ep.id as string) ?? "<no id>";
      console.log(`  [${i + 1}] Name: '${name}' (ID: ${id})`);
    });
  }

  // Exact match first
  const exact = endpoints.find((ep) => ep.name === endpointName);
  if (exact) {
    if (!quiet) {
      console.log(`Found exact match for endpoint: '${endpointName}'`);
    }
    return exact;
  }

  // Prefix match fallback
  for (const ep of endpoints) {
    const name = (ep.name as string) ?? "";
    if (name.startsWith(endpointName)) {
      if (!quiet) {
        console.log(
          `Found prefix match for endpoint: '${endpointName}' -> '${name}'`
        );
      }
      return ep;
    }
  }

  if (!quiet) {
    console.log(`No endpoint found with name: '${endpointName}'`);
  }
  return null;
}

/**
 * Update an existing RunPod endpoint with a new template.
 */
export async function updateRunpodEndpoint(
  endpointId: string,
  templateId: string,
  extra?: Record<string, unknown>
): Promise<boolean> {
  try {
    const updateData: Record<string, unknown> = {
      templateId,
      ...extra
    };

    // Remove undefined values
    for (const key of Object.keys(updateData)) {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    }

    console.log(`Updating endpoint ${endpointId} with template ${templateId}`);
    await makeRunpodApiCall(`endpoints/${endpointId}`, "PATCH", updateData);
    console.log(
      `Endpoint '${endpointId}' updated successfully with template: ${templateId}`
    );
    return true;
  } catch (err) {
    console.error(`Error updating endpoint '${endpointId}':`, err);
    return false;
  }
}

/**
 * Delete a RunPod endpoint by name.
 */
export async function deleteRunpodEndpointByName(
  endpointName: string
): Promise<boolean> {
  try {
    const result = await makeRunpodApiCall("endpoints", "GET");
    const endpoints = (result.endpoints as Record<string, unknown>[]) ?? [];

    let endpointId: string | undefined;

    console.log(`Looking for endpoint to delete: '${endpointName}'`);
    console.log(`Found ${endpoints.length} total endpoints`);

    // Exact match
    for (const ep of endpoints) {
      if (ep.name === endpointName) {
        endpointId = ep.id as string;
        console.log(
          `Found exact match for deletion: '${endpointName}' (ID: ${endpointId})`
        );
        break;
      }
    }

    // Case-insensitive fallback
    if (!endpointId) {
      for (const ep of endpoints) {
        const name = ((ep.name as string) ?? "").toLowerCase();
        if (name === endpointName.toLowerCase()) {
          endpointId = ep.id as string;
          console.log(
            `Found case-insensitive match for deletion: '${endpointName}' -> '${ep.name}' (ID: ${endpointId})`
          );
          break;
        }
      }
    }

    if (!endpointId) {
      console.log(`Endpoint '${endpointName}' not found (may not exist)`);
      return true;
    }

    await makeRunpodApiCall(`endpoints/${endpointId}`, "DELETE");
    console.log(
      `Endpoint '${endpointName}' (ID: ${endpointId}) deleted successfully`
    );
    return true;
  } catch (err) {
    console.error(`Error deleting endpoint '${endpointName}':`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Endpoint create / update (REST)
// ---------------------------------------------------------------------------

export interface CreateOrUpdateEndpointOptions {
  templateId: string;
  name: string;
  computeType?: string;
  gpuTypeIds?: string[];
  gpuCount?: number;
  cpuFlavorIds?: string[];
  vcpuCount?: number;
  dataCenterIds?: string[];
  workersMin?: number;
  workersMax?: number;
  idleTimeout?: number;
  executionTimeoutMs?: number;
  flashboot?: boolean;
  networkVolumeId?: string;
  allowedCudaVersions?: string[];
}

/**
 * Create or update a RunPod serverless endpoint using the REST API.
 *
 * If an endpoint with the same name already exists, it will be updated
 * with the new template. Otherwise a new endpoint is created.
 *
 * @returns The endpoint ID
 */
export async function createOrUpdateRunpodEndpoint(
  opts: CreateOrUpdateEndpointOptions
): Promise<string> {
  const {
    templateId,
    name,
    computeType = ComputeType.GPU,
    gpuCount,
    cpuFlavorIds,
    vcpuCount,
    workersMin = 0,
    workersMax = 3,
    idleTimeout = 5,
    executionTimeoutMs,
    flashboot = false,
    networkVolumeId,
    allowedCudaVersions
  } = opts;

  let gpuTypeIds = opts.gpuTypeIds;
  let dataCenterIds = opts.dataCenterIds ?? undefined;

  // Handle network volume and data center coordination
  if (networkVolumeId) {
    console.log(`Network volume specified: ${networkVolumeId}`);
    const volumeInfo = await getNetworkVolume(networkVolumeId);
    const volumeDataCenter = volumeInfo.dataCenterId as string | undefined;
    if (volumeDataCenter) {
      console.log(`Network volume is in data center: ${volumeDataCenter}`);
      dataCenterIds = [volumeDataCenter];
      console.log(
        `Endpoint will be deployed to same region: ${volumeDataCenter}`
      );
    }
  }

  if (gpuTypeIds == null && computeType === ComputeType.GPU) {
    gpuTypeIds = ["NVIDIA GeForce RTX 4090"];
  }
  if (dataCenterIds == null) {
    dataCenterIds = [];
  }

  // Check if endpoint already exists
  console.log(`Checking for existing endpoint: ${name}`);
  const existingEndpoint = await getRunpodEndpointByName(name);

  if (existingEndpoint) {
    const endpointId = existingEndpoint.id as string;
    console.log(`Found existing endpoint (ID: ${endpointId})`);
    console.log(
      `Current template: ${existingEndpoint.templateId ?? "unknown"}`
    );
    console.log(`Updating with new template: ${templateId}`);

    if (await updateRunpodEndpoint(endpointId, templateId)) {
      console.log(`Endpoint '${name}' updated successfully`);
      return endpointId;
    }
    console.log(`Failed to update endpoint '${name}', creating new one...`);
    await deleteRunpodEndpointByName(name);
  }

  console.log(`Creating new endpoint: ${name}`);
  console.log(`  Compute type: ${computeType}`);
  if (computeType === ComputeType.GPU) {
    console.log(`  GPU types: ${JSON.stringify(gpuTypeIds)}`);
    if (gpuCount) console.log(`  GPU count: ${gpuCount}`);
  } else {
    console.log(`  CPU flavors: ${JSON.stringify(cpuFlavorIds)}`);
    if (vcpuCount) console.log(`  vCPU count: ${vcpuCount}`);
  }
  console.log(
    `  Data centers: ${dataCenterIds.length > 0 ? JSON.stringify(dataCenterIds) : "Auto-selected"}`
  );
  console.log(`  Workers: ${workersMin}-${workersMax}`);

  const endpointData: Record<string, unknown> = {
    computeType,
    templateId,
    name,
    workersMin,
    workersMax,
    scalerType: "REQUEST_COUNT",
    scalerValue: 4,
    idleTimeout,
    flashboot
  };

  if (computeType === ComputeType.GPU) {
    endpointData.gpuTypeIds = gpuTypeIds ?? ["NVIDIA GeForce RTX 4090"];
    endpointData.gpuCount = gpuCount ?? 1;
  } else {
    endpointData.cpuFlavorIds = cpuFlavorIds ?? ["cpu3c"];
    if (vcpuCount) endpointData.vcpuCount = vcpuCount;
  }

  if (allowedCudaVersions && allowedCudaVersions.length > 0) {
    endpointData.allowedCudaVersions = allowedCudaVersions;
  }
  if (dataCenterIds.length > 0) {
    endpointData.dataCenterIds = dataCenterIds;
  }
  if (executionTimeoutMs) {
    endpointData.executionTimeoutMs = executionTimeoutMs;
  }
  if (networkVolumeId) {
    endpointData.networkVolumeId = networkVolumeId;
  }

  console.log("\nCreating endpoint with data:");
  console.log(JSON.stringify(endpointData, null, 2));

  const result = await makeRunpodApiCall("endpoints", "POST", endpointData);
  const endpointId = result.id as string | undefined;

  if (!endpointId) {
    console.error("Error: No endpoint ID returned");
    console.error(`Response data: ${JSON.stringify(result, null, 2)}`);
    throw new Error("No endpoint ID returned from RunPod API");
  }

  console.log("\nEndpoint created successfully!");
  console.log(`  ID: ${endpointId}`);
  console.log(`  Name: ${(result.name as string) ?? name}`);
  console.log(`  GPU Configuration: ${JSON.stringify(result.gpuTypeIds)}`);
  console.log(`  Workers: ${result.workersMin}-${result.workersMax}`);

  return endpointId;
}

// ---------------------------------------------------------------------------
// Endpoint create (GraphQL)
// ---------------------------------------------------------------------------

export interface CreateEndpointGraphQLOptions {
  templateId: string;
  name: string;
  computeType?: string;
  gpuTypeIds?: string[];
  gpuCount?: number;
  cpuFlavorIds?: string[];
  vcpuCount?: number;
  dataCenterIds?: string[];
  workersMin?: number;
  workersMax?: number;
  idleTimeout?: number;
  executionTimeoutMs?: number;
  flashboot?: boolean;
  networkVolumeId?: string;
  allowedCudaVersions?: string[];
}

/**
 * Create a RunPod serverless endpoint using raw GraphQL queries.
 *
 * If an endpoint with the same name already exists, it will be deleted first.
 *
 * @returns The endpoint ID
 */
export async function createRunpodEndpointGraphql(
  opts: CreateEndpointGraphQLOptions
): Promise<string> {
  const {
    templateId,
    name,
    computeType = ComputeType.GPU,
    gpuTypeIds,
    gpuCount,
    vcpuCount,
    workersMin = 0,
    workersMax = 3,
    idleTimeout = 5,
    executionTimeoutMs,
    flashboot = false,
    networkVolumeId
  } = opts;

  const dataCenterIds = opts.dataCenterIds ?? [];

  // Ensure API key
  getApiKey();

  // Delete existing endpoint if it exists
  console.log(`Checking for existing endpoint: ${name}`);
  if (await deleteRunpodEndpointByName(name)) {
    console.log(`Existing endpoint '${name}' deleted successfully`);
  } else {
    console.log(`Note: Endpoint '${name}' may not have existed`);
  }

  console.log(`Creating new endpoint: ${name}`);
  console.log(`  Compute type: ${computeType}`);
  console.log(`  GPU types: ${JSON.stringify(gpuTypeIds)}`);
  console.log(`  GPU count: ${gpuCount}`);
  console.log(
    `  Data centers: ${dataCenterIds.length > 0 ? JSON.stringify(dataCenterIds) : "Auto-selected"}`
  );
  console.log(`  Workers: ${workersMin}-${workersMax}`);
  console.log(`  Idle timeout: ${idleTimeout}s`);
  console.log(`  Execution timeout: ${executionTimeoutMs}ms`);
  console.log(`  Flashboot: ${flashboot}`);
  console.log(`  Network volume: ${networkVolumeId}`);

  const gpuIdsStr = gpuTypeIds ? gpuTypeIds.join(",") : "AMPERE_24";

  // Build mutation parts
  const endpointName = flashboot ? `${name}-fb` : name;
  const mutationParts: string[] = [];
  mutationParts.push(`name: "${gqlEscape(endpointName)}"`);
  mutationParts.push(`templateId: "${gqlEscape(templateId)}"`);
  mutationParts.push('type: "LB"');
  mutationParts.push(`workersMin: ${workersMin}`);
  mutationParts.push(`workersMax: ${workersMax}`);
  mutationParts.push(`idleTimeout: ${idleTimeout}`);
  mutationParts.push('scalerType: "REQUEST_COUNT"');
  mutationParts.push("scalerValue: 4");
  mutationParts.push(`executionTimeoutMs: ${executionTimeoutMs ?? 300000}`);
  mutationParts.push(`gpuIds: "${gqlEscape(gpuIdsStr)}"`);
  mutationParts.push(`gpuCount: ${gpuCount ?? 1}`);

  if (vcpuCount) {
    mutationParts.push(`vcpuCount: ${vcpuCount}`);
  }

  if (dataCenterIds.length > 0) {
    mutationParts.push(
      `locations: ${JSON.stringify(dataCenterIds.map(gqlEscape))}`
    );
  } else {
    mutationParts.push("locations: null");
  }

  if (networkVolumeId) {
    mutationParts.push(`networkVolumeId: "${gqlEscape(networkVolumeId)}"`);
  } else {
    mutationParts.push("networkVolumeId: null");
  }

  const mutation = `
    mutation {
        saveEndpoint(input: {
            ${mutationParts.join(", ")}
        }) {
            id
            name
            gpuIds
            idleTimeout
            locations
            type
            networkVolumeId
            executionTimeoutMs
            scalerType
            scalerValue
            templateId
            userId
            workersMax
            workersMin
            gpuCount
            __typename
        }
    }
  `;

  console.log("\nExecuting GraphQL mutation:");
  console.log(mutation);

  const result = await runGraphqlQuery(mutation);

  if ((result as GraphQLResponse).errors) {
    const errors = (result as GraphQLResponse).errors!;
    const msg = errors[0]?.message ?? "Unknown error";
    console.error(`Error creating endpoint: ${msg}`);
    console.error(`Full error response: ${JSON.stringify(result, null, 2)}`);
    throw new Error(`Failed to create RunPod endpoint: ${msg}`);
  }

  const data = (result.data as Record<string, unknown>) ?? {};
  const endpointData = (data.saveEndpoint as Record<string, unknown>) ?? {};
  const endpointId = endpointData.id as string | undefined;

  if (!endpointId) {
    console.error("Error: No endpoint ID returned");
    console.error(`Response data: ${JSON.stringify(result, null, 2)}`);
    throw new Error("No endpoint ID returned from RunPod GraphQL API");
  }

  console.log("\nEndpoint created successfully!");
  console.log(`  ID: ${endpointId}`);
  console.log(`  Name: ${endpointData.name}`);
  console.log(`  GPU Configuration: ${endpointData.gpuIds}`);
  console.log(
    `  Workers: ${endpointData.workersMin}-${endpointData.workersMax}`
  );
  console.log(`  Scaler: ${endpointData.scalerType}`);

  return endpointId;
}
