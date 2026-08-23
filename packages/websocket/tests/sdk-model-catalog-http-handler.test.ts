import { describe, expect, it, vi } from "vitest";
import { handleSdkV1ModelCatalog } from "../src/sdk/sdk-model-catalog-http-handler.js";
import { createSdkV1ImplementationBoundary } from "../src/sdk/sdk-v1-handler-map.js";
import {
  createSdkV1Service,
  type SdkV1ServiceOptions
} from "../src/sdk/sdk-v1-service.js";

type ModelCatalogService = NonNullable<
  SdkV1ServiceOptions["modelCatalogService"]
>;

function boundary(list: ModelCatalogService["list"]) {
  return createSdkV1ImplementationBoundary(
    createSdkV1Service({ modelCatalogService: { list } })
  );
}

const emptyCatalog = {
  version: "1" as const,
  catalog_revision: "revision",
  scope: "local" as const,
  entries: [],
  next_cursor: null
};

describe("SDK model catalog HTTP handler", () => {
  it("parses bounded filters and passes the authenticated user", async () => {
    const list = vi.fn().mockResolvedValue(emptyCatalog);
    const response = await handleSdkV1ModelCatalog(
      new Request(
        "http://localhost/api/sdk/v1/models?compatibility=language_model&limit=25"
      ),
      {
        boundary: boundary(list),
        getUserId: () => "alice"
      }
    );

    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith({
      userId: "alice",
      query: {
        compatibility: "language_model",
        scope: "local",
        limit: 25
      }
    });
  });

  it("rejects invalid or excessive limits", async () => {
    const response = await handleSdkV1ModelCatalog(
      new Request("http://localhost/api/sdk/v1/models?limit=501"),
      {
        boundary: boundary(vi.fn()),
        getUserId: () => "1"
      }
    );
    expect(response.status).toBe(400);
  });
});
