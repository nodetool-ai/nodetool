import { describe, expect, it, vi } from "vitest";
import { createDreaminaMusic, musicDraftFor, musicUrlOf, type DreaminaMusicApi, type DreaminaMusicRecord } from "../../src/providers/dreamina-music.js";
import type { MusicModel } from "../../src/providers/types.js";

const RECORD: DreaminaMusicRecord = {
  item_list: [{ audio: { origin_audio: { url: "https://cdn.example/track.wav", format: "wav", duration_ms: 10000 } }, common_attr: { item_urls: ["https://cdn.example/fallback.wav"] } }]
};

const SONG_CONFIG = {
  song: {
    model_list: [
      { model_req_key: "song_v1", model_name: "Song One", model_status: 0, options: [{ key: "duration", enum_val: { int_value: [30, 60], default_val_idx: 0 } }] },
      { model_req_key: "song_old", model_name: "Song Old", model_status: 1 }
    ]
  }
};

function setup(config: unknown = { song: { model_list: null } }, record: DreaminaMusicRecord = RECORD) {
  const calls: Array<{ path: string; body: any }> = [];
  const submits: Array<{ body: Record<string, any>; submitId: string; timeoutMs: number }> = [];
  const api: DreaminaMusicApi = {
    appId: 513641,
    daVersion: "3.3.28",
    callApi: vi.fn(async (path: string, body: unknown) => {
      calls.push({ path, body });
      return config as never;
    }),
    submitAndAwait: vi.fn(async (body, submitId, timeoutMs) => {
      submits.push({ body, submitId, timeoutMs });
      return record;
    }),
    download: vi.fn(async () => new Uint8Array([1, 2, 3]))
  };
  return { api, calls, submits, music: createDreaminaMusic(api) };
}

const draftOf = (submit: { body: Record<string, any> }) => JSON.parse(submit.body.draft_content as string);
const instrumental: MusicModel = { id: "instrumental", name: "Dreamina Instrumental", provider: "dreamina" };

describe("Dreamina music models", () => {
  it("offers only the instrumental model when the account lists no vocal model", async () => {
    const { music, calls } = setup();
    const models = await music.models();
    expect(models.map((m) => m.id)).toEqual(["instrumental"]);
    expect(models[0].supportedTasks).toEqual(["text_to_music"]);
    expect(calls[0]).toEqual({ path: "/mweb/v1/audio_generate/get_common_config", body: { scene_list: ["song"] } });
  });

  it("adds online vocal models from the config and skips offline ones", async () => {
    const { music } = setup(SONG_CONFIG);
    expect((await music.models()).map((m) => m.id)).toEqual(["instrumental", "song_v1"]);
  });

  it("still offers instrumental music when the config call fails", async () => {
    const { api } = setup();
    api.callApi = vi.fn(async () => { throw new Error("offline"); });
    expect((await createDreaminaMusic(api).models()).map((m) => m.id)).toEqual(["instrumental"]);
  });
});

describe("Dreamina instrumental music", () => {
  it("submits an audio draft with the instrumental ability and returns the downloaded track", async () => {
    const { music, submits, api } = setup();
    const result = await music.generate({ model: instrumental, prompt: " calm piano ", durationSeconds: 15 });
    expect(result).toEqual({ data: new Uint8Array([1, 2, 3]), mimeType: "audio/wav" });
    expect(api.download).toHaveBeenCalledWith("https://cdn.example/track.wav", undefined);

    const [submit] = submits;
    expect(submit.body.submit_id).toBe(submit.submitId);
    expect(submit.body.http_common_info).toEqual({ aid: 513641 });
    expect(submit.body.extend).toBeUndefined();
    const draft = draftOf(submit);
    expect(draft.version).toBe("3.3.28");
    const component = draft.component_list[0];
    expect(draft.main_component_id).toBe(component.id);
    expect(component).toMatchObject({ type: "audio_base_component", min_version: "3.2.3", aigc_mode: "workbench", generate_type: "generate_instrumental" });
    expect(component.abilities.generate_instrumental).toMatchObject({ prompt: "calm piano", duration: 15, title: "" });
    expect(component.abilities.generate_instrumental.model_req_key).toBeUndefined();
    expect(component.abilities.generate_song).toBeUndefined();
  });

  it("defaults to 10 seconds and a five minute wait", async () => {
    const { music, submits } = setup();
    await music.generate({ model: instrumental, prompt: "ambient" });
    expect(draftOf(submits[0]).component_list[0].abilities.generate_instrumental.duration).toBe(10);
    expect(submits[0].timeoutMs).toBe(300_000);
  });

  it("honors the per-call timeout", async () => {
    const { music, submits } = setup();
    await music.generate({ model: instrumental, prompt: "ambient", timeoutSeconds: 90 });
    expect(submits[0].timeoutMs).toBe(90_000);
  });

  it("rejects lyrics, an empty prompt, and a fractional duration before any request", async () => {
    const { music, submits } = setup();
    await expect(music.generate({ model: instrumental, prompt: "x", lyrics: "la la" })).rejects.toThrow(/takes no lyrics/);
    await expect(music.generate({ model: instrumental, prompt: "  " })).rejects.toThrow(/prompt must not be empty/);
    await expect(music.generate({ model: instrumental, prompt: "x", durationSeconds: 7.5 })).rejects.toThrow(/whole number of seconds/);
    expect(submits).toHaveLength(0);
  });

  it("fails when the finished record carries no audio", async () => {
    const { music } = setup(undefined, { item_list: [{}] });
    await expect(music.generate({ model: instrumental, prompt: "x" })).rejects.toThrow(/without audio/);
  });
});

describe("Dreamina vocal songs", () => {
  const song: MusicModel = { id: "song_v1", name: "Song One", provider: "dreamina" };

  it("sends the model key and lyrics as one paragraph node per line", async () => {
    const { music, submits } = setup(SONG_CONFIG);
    await music.generate({ model: song, prompt: "warm indie pop", lyrics: "first line\nsecond line", durationSeconds: 30 });
    const component = draftOf(submits[0]).component_list[0];
    expect(component.generate_type).toBe("generate_song");
    const ability = component.abilities.generate_song;
    expect(ability).toMatchObject({ prompt: "warm indie pop", duration: 30, model_req_key: "song_v1", tags: [] });
    const lines = ability.lyrics.children.map((p: any) => ({ type: p.type, text: p.children.map((t: any) => `${t.type}:${t.content}`) }));
    expect(lines).toEqual([{ type: "paragraph", text: ["text:first line"] }, { type: "paragraph", text: ["text:second line"] }]);
  });

  it("leaves lyrics out when none are given", async () => {
    const { music, submits } = setup(SONG_CONFIG);
    await music.generate({ model: song, prompt: "warm indie pop", durationSeconds: 60 });
    expect(draftOf(submits[0]).component_list[0].abilities.generate_song.lyrics).toBeUndefined();
  });

  it("rejects unknown models and durations the model does not offer", async () => {
    const { music, submits } = setup(SONG_CONFIG);
    await expect(music.generate({ model: { ...song, id: "nope" }, prompt: "x" })).rejects.toThrow(/Unknown Dreamina music model: nope/);
    await expect(music.generate({ model: song, prompt: "x", durationSeconds: 45 })).rejects.toThrow(/offers 30, 60 second tracks, not 45/);
    expect(submits).toHaveLength(0);
  });
});

describe("Dreamina music results", () => {
  it("prefers the original track, then the item file list", () => {
    expect(musicUrlOf(RECORD)).toEqual({ url: "https://cdn.example/track.wav", format: "wav" });
    expect(musicUrlOf({ item_list: [{ common_attr: { item_urls: ["https://cdn.example/a.wav"] } }] })).toEqual({ url: "https://cdn.example/a.wav", format: "wav" });
    expect(musicUrlOf({ item_list: [] })).toBeUndefined();
  });

  it("maps the container to a MIME type", async () => {
    const { music } = setup(undefined, { item_list: [{ audio: { origin_audio: { url: "https://cdn.example/t.mp3", format: "MP3" } } }] });
    expect((await music.generate({ model: instrumental, prompt: "x" })).mimeType).toBe("audio/mpeg");
  });

  it("builds a draft the page accepts as an audio component", () => {
    const draft = JSON.parse(musicDraftFor({ kind: "generate_instrumental", prompt: "p", durationSeconds: 5 }, "3.3.28"));
    expect(draft).toMatchObject({ type: "draft", min_version: "3.2.3", is_from_tsn: true, min_features: [] });
    expect(draft.component_list).toHaveLength(1);
  });
});
