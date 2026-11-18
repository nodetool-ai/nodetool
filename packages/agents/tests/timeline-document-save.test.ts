/**
 * The checks a whole timeline document passes before it is stored
 * (`timeline-document-save.ts`). `set_timeline_document` and the import of a
 * timeline file in a project folder share them, so each stores the same
 * document and refuses the same one with the same issues.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Asset, TimelineSequence, initTestDb } from "@nodetool-ai/models";
import { UNGATED, createCapabilityRun } from "../src/capabilities/invoke.js";
import { prepareTimelineDocumentForSave } from "../src/timeline-document-save.js";

const USER = "user-timeline-save";
const CURRENT = { fps: 30, width: 1920, height: 1080 };

function run(): ReturnType<typeof createCapabilityRun> {
  return createCapabilityRun({
    context: { userId: USER } as unknown as ProcessingContext,
    gate: UNGATED
  });
}

/** A hand-authored cut: no bookkeeping fields and an undeclared track. */
function authored(mediaType = "shape"): Record<string, unknown> {
  return {
    clips: [
      {
        id: "title",
        trackId: "titles",
        name: "Title",
        startMs: 500,
        durationMs: 1500,
        mediaType,
        shapeStyle: { kind: "rect", fill: "#00ff00" }
      }
    ]
  };
}

async function makeTimeline(): Promise<TimelineSequence> {
  return TimelineSequence.create<TimelineSequence>({
    user_id: USER,
    project_id: "default",
    name: "Cut"
  });
}

beforeEach(() => {
  initTestDb();
});

describe("prepareTimelineDocumentForSave", () => {
  it("fills in what an authored document leaves out and computes the duration", async () => {
    const prepared = await prepareTimelineDocumentForSave(authored(), {
      userId: USER,
      current: CURRENT
    });

    expect(prepared).toMatchObject({ ok: true, ...CURRENT, durationMs: 2000 });
    if (!prepared.ok) return;
    expect(prepared.document["tracks"]).toEqual([
      expect.objectContaining({ id: "titles", index: 0, visible: true, locked: false })
    ]);
    expect(prepared.document["markers"]).toEqual([]);
    expect(prepared.document["clips"]).toEqual([
      expect.objectContaining({ id: "title", status: "generated", locked: false })
    ]);
    // A document in the stored shape comes back as it is.
    const again = await prepareTimelineDocumentForSave(prepared.document, {
      userId: USER,
      current: CURRENT
    });
    expect(again.ok && again.document).toEqual(prepared.document);
  });

  it("resolves each setting: beside the document, then inside it, then the current one", async () => {
    const prepared = await prepareTimelineDocumentForSave(
      { ...authored(), fps: 25, width: 1280, name: "  Renamed  " },
      { userId: USER, current: CURRENT, settings: { fps: 60 } }
    );

    expect(prepared).toMatchObject({
      ok: true,
      fps: 60,
      width: 1280,
      height: 1080,
      name: "Renamed"
    });
    // The settings and the name are the row's, not the document's.
    expect(prepared.ok && Object.keys(prepared.document)).toEqual([
      "clips",
      "tracks",
      "markers"
    ]);
    expect(
      await prepareTimelineDocumentForSave(authored(), {
        userId: USER,
        current: CURRENT,
        settings: { width: 0 }
      })
    ).toEqual({ ok: false, error: "width must be a positive number." });
  });

  it("turns the asset form the tools print into the asset's full ID", async () => {
    const asset = await Asset.create<Asset>({
      user_id: USER,
      project_id: "default",
      name: "poster.png",
      content_type: "image/png"
    });
    const document = authored("image");
    (document["clips"] as Array<Record<string, unknown>>)[0]!["currentAssetId"] =
      `asset://${asset.id.slice(0, 12)}.png`;

    const prepared = await prepareTimelineDocumentForSave(document, {
      userId: USER,
      current: CURRENT
    });

    expect(prepared.ok && prepared.document["clips"]).toEqual([
      expect.objectContaining({ currentAssetId: asset.id })
    ]);
  });

  it("refuses the document set_timeline_document refuses, with the same issues, and stores the same one", async () => {
    const timeline = await makeTimeline();
    const broken = authored("hologram");

    const prepared = await prepareTimelineDocumentForSave(broken, {
      userId: USER,
      current: timeline
    });
    const refused = (await run().invoke("set_timeline_document", {
      timeline_id: timeline.id,
      document: broken
    })) as { error: string; written: boolean; validation: unknown };

    expect(prepared.ok).toBe(false);
    expect(prepared).toMatchObject({ error: "The document has 1 error" });
    expect(refused.written).toBe(false);
    expect(refused.error).toBe(
      `The document has 1 error and was not written to timeline ${timeline.id}. Fix them and call again.`
    );
    expect(refused.validation).toEqual(!prepared.ok && prepared.validation);
    expect((await TimelineSequence.findById(timeline.id))?.revision).toBe(
      timeline.revision
    );

    const good = await prepareTimelineDocumentForSave(authored(), {
      userId: USER,
      current: timeline
    });
    const written = (await run().invoke("set_timeline_document", {
      timeline_id: timeline.id,
      document: authored()
    })) as Record<string, unknown>;
    const stored = await TimelineSequence.findById(timeline.id);

    expect(written).toMatchObject({ ok: true, written: true, duration_ms: 2000 });
    expect(good.ok && good.document).toEqual(JSON.parse(stored?.document ?? "{}"));
    expect(good).toMatchObject({
      fps: stored?.fps,
      width: stored?.width,
      height: stored?.height,
      durationMs: stored?.duration_ms
    });
  });
});
