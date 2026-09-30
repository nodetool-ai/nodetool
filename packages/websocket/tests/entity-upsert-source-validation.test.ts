import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Asset, initTestDb, ModelObserver } from "@nodetool-ai/models";
import { ENTITY_METADATA_KEY, readEntityMarker } from "@nodetool-ai/protocol";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { CreateEntityNode } from "@nodetool-ai/base-nodes";
import { entityModelInterfaces } from "../src/lib/document-model-interfaces.js";

const USER = "owner";
const args = {
  userId: USER,
  kind: "prop" as const,
  name: "Product",
  descriptor: "Original",
  imageAssetId: "original",
  source: { key: "sku-1" }
};

beforeEach(() => initTestDb());
afterEach(() => {
  ModelObserver.clear();
  vi.restoreAllMocks();
});

async function seed(): Promise<void> {
  await Asset.create({
    id: "original",
    user_id: USER,
    name: "Original",
    content_type: "image/png",
    metadata: { extra: "preserved" }
  });
  await Asset.create({
    id: "video",
    user_id: USER,
    name: "Video",
    content_type: "video/mp4"
  });
  await Asset.create({
    id: "foreign",
    user_id: "other",
    name: "Foreign",
    content_type: "image/png"
  });
  await Asset.create({
    id: "replacement",
    user_id: USER,
    name: "Replacement",
    content_type: "image/png"
  });
}

for (const viaNode of [false, true]) {
  describe(
    viaNode
      ? "CreateEntityNode source validation"
      : "entity adapter source validation",
    () => {
      async function upsert(imageAssetId: string, descriptor = "Changed") {
        const interfaces = entityModelInterfaces();
        if (!viaNode) {
          return interfaces.upsertEntity({ ...args, imageAssetId, descriptor });
        }
        const context = new ProcessingContext({ jobId: "test", userId: USER });
        context.setModelInterfaces(interfaces);
        const node = new CreateEntityNode();
        node.assign({
          image: { type: "image", asset_id: imageAssetId },
          kind: args.kind,
          name: args.name,
          descriptor,
          key: "sku-1"
        });
        const provider = vi.spyOn(context, "runProviderPrediction");
        try {
          return await node.process(context);
        } finally {
          expect(provider).not.toHaveBeenCalled();
        }
      }

      it.each(["missing", "video", "foreign"])(
        "refuses %s on existing and new entities without changing metadata",
        async (imageAssetId) => {
          await seed();
          await entityModelInterfaces().upsertEntity(args);
          const before = await Asset.find(USER, "original");
          const find = vi.spyOn(Asset, "find");
          const save = vi.spyOn(Asset.prototype, "save");
          await expect(upsert(imageAssetId)).rejects.toThrow();
          expect(find).toHaveBeenCalledWith(USER, imageAssetId);
          expect(save).not.toHaveBeenCalled();
          const after = await Asset.find(USER, "original");
          expect(after?.metadata).toEqual(before?.metadata);
          expect(after?.updated_at).toBe(before?.updated_at);
          await expect(
            entityModelInterfaces().upsertEntity({
              ...args,
              source: { key: "new" },
              name: "New",
              imageAssetId
            })
          ).rejects.toThrow();
        }
      );

      it("refuses system entity updates without changing its marker", async () => {
        await seed();
        await entityModelInterfaces().upsertEntity(args);
        const original = await Asset.find(USER, "original");
        original!.metadata = {
          ...original!.metadata,
          [ENTITY_METADATA_KEY]: {
            ...readEntityMarker(original!.metadata),
            system: true
          }
        };
        await original!.save();
        const before = await Asset.find(USER, "original");
        const save = vi.spyOn(Asset.prototype, "save");
        await expect(upsert("replacement")).rejects.toThrow(
          /shipped style preset/
        );
        expect(save).not.toHaveBeenCalled();
        const after = await Asset.find(USER, "original");
        expect(after?.metadata).toEqual(before?.metadata);
        expect(after?.updated_at).toBe(before?.updated_at);
      });

      it.each([false, true])(
        "stores full source IDs from prefixes, existing=%s",
        async (existing) => {
          await seed();
          if (existing) {
            await entityModelInterfaces().upsertEntity(args);
          }
          const replacementId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
          await Asset.create({
            id: replacementId,
            user_id: USER,
            name: "Full ID replacement",
            content_type: "image/png"
          });
          const result = await upsert(replacementId.slice(0, 12));
          expect(result.created).toBe(!existing);
          const entityId = existing ? "original" : replacementId;
          expect(result.entity.id).toBe(entityId);
          expect(result.entity.reference_images[0].asset_id).toBe(
            replacementId
          );
          const stored = await Asset.find(USER, entityId);
          expect(readEntityMarker(stored?.metadata)?.reference_asset_id).toBe(
            existing ? replacementId : undefined
          );
        }
      );

      it("refuses an ambiguous source prefix before changing an entity", async () => {
        await seed();
        await entityModelInterfaces().upsertEntity(args);
        const prefix = "aaaaaaaaaaaa";
        for (const suffix of ["a", "b"]) {
          await Asset.create({
            id: `${prefix}${suffix.repeat(20)}`,
            user_id: USER,
            name: "Ambiguous replacement",
            content_type: "image/png"
          });
        }
        const before = await Asset.find(USER, "original");
        const save = vi.spyOn(Asset.prototype, "save");
        await expect(upsert(prefix)).rejects.toThrow(
          /matches more than one row/
        );
        expect(save).not.toHaveBeenCalled();
        const after = await Asset.find(USER, "original");
        expect(after?.metadata).toEqual(before?.metadata);
        expect(after?.updated_at).toBe(before?.updated_at);
      });

      it("replaces valid references while preserving the entity identity", async () => {
        await seed();
        await entityModelInterfaces().upsertEntity(args);
        const result = await upsert("replacement");
        expect(result.created).toBe(false);
        expect(result.entity.id).toBe("original");
        expect(result.entity.reference_images[0].asset_id).toBe("replacement");
        expect(result.entity.descriptor).toBe("Changed");
        expect((await Asset.find(USER, "original"))?.metadata?.extra).toBe(
          "preserved"
        );
        expect(
          (await Asset.find(USER, "replacement"))?.metadata?.[
            ENTITY_METADATA_KEY
          ]
        ).toBeUndefined();
      });
    }
  );
}
