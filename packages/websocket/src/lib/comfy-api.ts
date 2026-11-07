/**
 * The per-user Comfy routes as Request-to-Response handlers, so the Fastify
 * server and the test UI server answer them the same way.
 */

import { getSecret } from "@nodetool-ai/models";
import {
  comfyObjectInfoToMetadata,
  comfyOutputNames,
  comfyPromptToGraph,
  type ComfyApiPrompt
} from "@nodetool-ai/protocol";
import { importPack, MissingPackError } from "@nodetool-ai/node-catalog";
import { ApiErrorCode, apiError } from "../error-codes.js";
import { isObjectLike, isString } from "./wire-values.js";

type IntegrationModule = typeof import("@nodetool-ai/integration-nodes");

/**
 * `GET /api/comfy/nodes`: the selected Comfy target's node catalog as NodeTool
 * node metadata, one `comfy.<ClassName>` type per ComfyUI class.
 */
export async function handleComfyNodes(
  request: Request,
  userId: string
): Promise<Response> {
  const { fetchComfyTargetCatalog, resolveComfyTarget } =
    await importPack<IntegrationModule>("integration");
  let target;
  try {
    target = await resolveComfyTarget((key) => getSecret(key, userId));
  } catch (error) {
    return Response.json(
      apiError(
        ApiErrorCode.INVALID_INPUT,
        error instanceof Error ? error.message : String(error)
      ),
      { status: 400 }
    );
  }
  try {
    const info = await fetchComfyTargetCatalog(target, { signal: request.signal });
    // Only Comfy Cloud needs a key. The user's own server or worker needs none.
    const requiredSettings = target.kind === "cloud" ? ["COMFY_API_KEY"] : [];
    return Response.json(comfyObjectInfoToMetadata(info, { requiredSettings }));
  } catch (error) {
    return Response.json(
      apiError(
        ApiErrorCode.SERVICE_UNAVAILABLE,
        error instanceof Error ? error.message : String(error)
      ),
      { status: 502 }
    );
  }
}

/**
 * `GET /api/comfy/server-status`: the version, GPU and model files of the
 * ComfyUI saved in `COMFY_SERVER_URL`, so the user can see the app reached it.
 * It only reads the saved address, never one from the request.
 */
export async function handleComfyServerStatus(
  request: Request,
  userId: string
): Promise<Response> {
  const serverUrl = (await getSecret("COMFY_SERVER_URL", userId))?.trim();
  if (!serverUrl) {
    return Response.json(
      apiError(ApiErrorCode.INVALID_INPUT, "No ComfyUI address is saved."),
      { status: 400 }
    );
  }
  try {
    const { fetchComfyServerStatus } = await importPack<IntegrationModule>("integration");
    return Response.json(await fetchComfyServerStatus(serverUrl, { signal: request.signal }));
  } catch (error) {
    return Response.json(
      apiError(
        ApiErrorCode.SERVICE_UNAVAILABLE,
        error instanceof Error ? error.message : String(error)
      ),
      { status: 502 }
    );
  }
}

/**
 * `POST /api/comfy/import-graph`: a ComfyUI API-format workflow as a Comfy
 * workflow graph of `comfy.*` nodes, laid out by dependency depth.
 */
export async function handleComfyImportGraph(
  request: Request,
  userId: string
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { workflow?: unknown } | null;
  let workflow = body?.workflow;
  if (isString(workflow)) {
    try {
      workflow = JSON.parse(workflow);
    } catch {
      workflow = null;
    }
  }
  if (!isObjectLike(workflow) || Array.isArray(workflow)) {
    return Response.json(
      apiError(ApiErrorCode.INVALID_INPUT, "workflow must be a ComfyUI API-format object"),
      { status: 400 }
    );
  }
  const prompt = workflow as ComfyApiPrompt;
  let outputNames: (cls: string) => string[] | undefined = () => undefined;
  try {
    const { fetchComfyTargetCatalog, resolveComfyTarget } =
      await importPack<IntegrationModule>("integration");
    const target = await resolveComfyTarget((key) => getSecret(key, userId));
    const info = await fetchComfyTargetCatalog(target, { signal: request.signal });
    outputNames = (cls) => (info[cls] ? comfyOutputNames(info[cls]) : undefined);
  } catch {
    // Without the catalog, edges fall back to `output_<index>` handles.
  }
  return Response.json(comfyPromptToGraph(prompt, outputNames));
}

/**
 * `POST /api/comfy/resolve-workflow`: an API-format workflow (`workflow`) or a
 * ComfyUI-exported PNG (`png_base64`) resolved to the prompt, dynamic inputs,
 * outputs and exposable params the editor shows.
 */
export async function handleComfyResolveWorkflow(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    workflow?: unknown;
    png_base64?: unknown;
  } | null;
  if (!isObjectLike(body) || (body.workflow === undefined && !isString(body.png_base64))) {
    return Response.json(
      apiError(ApiErrorCode.INVALID_INPUT, "Send workflow or png_base64"),
      { status: 400 }
    );
  }
  try {
    const { resolveComfyWorkflow } = await importPack<IntegrationModule>("integration");
    return Response.json(
      resolveComfyWorkflow(
        isString(body.png_base64) ? { png_base64: body.png_base64 } : { workflow: body.workflow }
      )
    );
  } catch (error) {
    if (error instanceof MissingPackError) {
      return Response.json(
        { ...error.details, ...apiError(ApiErrorCode.SERVICE_UNAVAILABLE, error.message) },
        { status: 503 }
      );
    }
    return Response.json(
      apiError(
        ApiErrorCode.INVALID_INPUT,
        error instanceof Error ? error.message : String(error)
      ),
      { status: 400 }
    );
  }
}
