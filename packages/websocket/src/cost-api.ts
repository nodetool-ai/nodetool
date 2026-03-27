/**
 * Cost API -- REST handlers for prediction cost tracking.
 */

import { Prediction } from "@nodetool/models";

type JsonObject = Record<string, unknown>;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(status: number, detail: string): Response {
  return jsonResponse({ detail }, status);
}

function getUserId(request: Request, headerName = "x-user-id"): string {
  return request.headers.get(headerName) ?? request.headers.get("x-user-id") ?? "1";
}

function toPredictionResponse(pred: Prediction): JsonObject {
  return {
    id: pred.id,
    user_id: pred.user_id,
    node_id: pred.node_id ?? "",
    provider: pred.provider,
    model: pred.model,
    workflow_id: pred.workflow_id ?? null,
    cost: pred.cost ?? null,
    input_tokens: pred.input_tokens ?? null,
    output_tokens: pred.output_tokens ?? null,
    total_tokens: pred.total_tokens ?? null,
    cached_tokens: pred.cached_tokens ?? null,
    reasoning_tokens: pred.reasoning_tokens ?? null,
    created_at: pred.created_at,
    metadata: pred.metadata ?? null,
  };
}

export async function handleCostRequest(
  request: Request,
  options: { userIdHeader?: string },
): Promise<Response | null> {
  const url = new URL(request.url);
  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  if (!pathname.startsWith("/api/costs")) return null;

  const userId = getUserId(request, options.userIdHeader);

  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }

  // GET /api/costs
  if (pathname === "/api/costs") {
    const provider = url.searchParams.get("provider") ?? undefined;
    const model = url.searchParams.get("model") ?? undefined;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Math.min(Math.max(Number.parseInt(limitRaw, 10) || 50, 1), 500) : 50;
    const startKey = url.searchParams.get("start_key") ?? undefined;

    const [calls, nextKey] = await Prediction.paginate(userId, {
      provider,
      model,
      limit,
      startKey,
    });

    return jsonResponse({
      calls: calls.map(toPredictionResponse),
      next_start_key: nextKey || null,
    });
  }

  // GET /api/costs/aggregate
  if (pathname === "/api/costs/aggregate") {
    const provider = url.searchParams.get("provider") ?? undefined;
    const model = url.searchParams.get("model") ?? undefined;
    const result = await Prediction.aggregateByUser(userId, { provider, model });
    return jsonResponse(result);
  }

  // GET /api/costs/aggregate/by-provider
  if (pathname === "/api/costs/aggregate/by-provider") {
    const result = await Prediction.aggregateByProvider(userId);
    return jsonResponse(result);
  }

  // GET /api/costs/aggregate/by-model
  if (pathname === "/api/costs/aggregate/by-model") {
    const provider = url.searchParams.get("provider") ?? undefined;
    const result = await Prediction.aggregateByModel(userId, { provider });
    return jsonResponse(result);
  }

  // GET /api/costs/summary
  if (pathname === "/api/costs/summary") {
    const [overall, byProvider, byModel] = await Promise.all([
      Prediction.aggregateByUser(userId),
      Prediction.aggregateByProvider(userId),
      Prediction.aggregateByModel(userId),
    ]);
    const [recentCalls] = await Prediction.paginate(userId, { limit: 10 });

    return jsonResponse({
      overall,
      by_provider: byProvider,
      by_model: byModel,
      recent_calls: recentCalls.map(toPredictionResponse),
    });
  }

  return null;
}
