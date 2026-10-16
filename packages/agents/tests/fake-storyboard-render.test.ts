import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Storyboard, initTestDb } from "@nodetool-ai/models";
import { getProvider, getRegisteredProvider } from "@nodetool-ai/runtime";
import {
  createFakeContext,
  type FakeContextHandle
} from "@nodetool-ai/runtime";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";

let handle: FakeContextHandle | undefined;
beforeEach(() => initTestDb());
afterEach(() => handle?.cleanup());

describe("explicit fake media storyboard rendering", () => {
  it("discovers real fake models and renders a persisted still and clip without credentials", async () => {
    expect(getRegisteredProvider("fake")).not.toBeNull();
    const provider = await getProvider("fake", () => {
      throw new Error("Fake media must not request credentials");
    });
    const images = await provider.getAvailableImageModels();
    const videos = await provider.getAvailableVideoModels();
    expect(images[0]).toMatchObject({ provider: "fake", id: "fake-image" });
    expect(videos[0]).toMatchObject({ provider: "fake", id: "fake-video" });
    expect(await provider.getAvailableLanguageModels()).toEqual([]);
    handle = createFakeContext({ providers: { fake: provider } });
    const context = handle.context;
    const capability = (name: string) =>
      toolForCapabilityName(name, (ctx) =>
        createCapabilityRun({
          context: ctx,
          gate: UNGATED,
          providers: { fake: provider }
        })
      );
    const automatic = (await capability("find_model").process(context, {
      capability: "text_to_image"
    })) as { results: unknown[] };
    expect(automatic.results).toEqual([]);
    const withoutFake = toolForCapabilityName("find_model", (ctx) =>
      createCapabilityRun({
        context: ctx,
        gate: UNGATED,
        providers: { paid: provider }
      })
    );
    expect(
      await withoutFake.process(context, {
        capability: "text_to_image",
        provider_hint: "fake"
      })
    ).toMatchObject({ results: [] });
    const discovered = (await capability("find_model").process(context, {
      capability: "text_to_image",
      provider_hint: "fake"
    })) as { ref: { id: string; provider: string } };
    expect(discovered.ref).toMatchObject({
      id: "fake-image",
      provider: "fake"
    });
    const board = await Storyboard.create<Storyboard>({
      user_id: "fake-user",
      name: "No-cost board",
      project_id: "default",
      document: JSON.stringify({
        screenplay: null,
        brief: "Harbor",
        style: "",
        aspectRatio: "16:9",
        entityIds: [],
        directorModel: null,
        imageModel: { type: "image_model", ...images[0] },
        videoModel: { type: "video_model", ...videos[0] },
        shots: [
          {
            type: "shot",
            id: "opening",
            index: 0,
            action: "Harbor boat",
            status: "planned",
            duration_seconds: 2
          }
        ]
      })
    });
    const still = (await capability("render_storyboard_stills").process(
      context,
      { storyboard_id: board.id }
    )) as { rendered: number; failed: number };
    expect(still).toMatchObject({ rendered: 1, failed: 0 });
    const clip = (await capability("render_storyboard_clips").process(context, {
      storyboard_id: board.id
    })) as { rendered: number; failed: number };
    expect(clip).toMatchObject({ rendered: 1, failed: 0 });
    const saved = await Storyboard.findById(board.id);
    const shot = saved?.toDocument().shots[0];
    expect(shot?.keyframe?.uri).toMatch(/^asset:\/\//);
    expect(shot?.clip?.uri).toMatch(/^asset:\/\//);
    const image = await context.resolveAssetBytes(shot!.keyframe!.uri!);
    const video = await context.resolveAssetBytes(shot!.clip!.uri!);
    expect([...image.bytes!.slice(0, 8)]).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10
    ]);
    expect(new TextDecoder().decode(video.bytes!.slice(4, 8))).toBe("ftyp");
    expect(handle.providers.size).toBe(1);
  });
});
