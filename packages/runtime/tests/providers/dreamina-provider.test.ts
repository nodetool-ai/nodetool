import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { DreaminaProvider, setDreaminaPageRunner } from "../../src/providers/dreamina-provider.js";
import type { ImageModel, MusicModel, VideoModel } from "../../src/providers/types.js";

interface CapturedCall { url: URL; headers: Record<string, string>; body: Record<string, any> }

const CONFIG = {
  model_list: [
    {
      model_req_key: "high_aes_general_v40",
      model_name: "Seedream 4.0",
      feats: ["t2i", "byte_edit"],
      resolution_map: {
        "2k": { image_ratio_sizes: [{ ratio_type: 1, width: 2048, height: 2048 }, { ratio_type: 3, width: 2560, height: 1440 }] }
      }
    },
    { model_req_key: "edit_only", model_name: "Edit", feats: ["i2i"] }
  ]
};

const VIDEO_CONFIG = {
  model_list: [
    {
      model_req_key: "dreamina_seedance_40_mini",
      model_name: "Dreamina Seedance 2.0 Mini",
      options: [
        { key: "resolution", enum_val: { string_value: ["720p", "1080p"], default_val_idx: 0 } },
        { key: "frames", enum_val: { int_value: [96, 120, 144], default_val_idx: 0 } },
        { key: "video_aspect_ratio", enum_val: { string_value: ["21:9", "16:9", "9:16"], default_val_idx: 1 } },
        { key: "input_media_type", enum_val: { string_value: ["unified_edit", "prompt", "first_frame", "end_frame"], default_val_idx: 0 } },
        { key: "unified_edit" }
      ]
    },
    {
      model_req_key: "legacy_model",
      model_name: "Legacy",
      options: [
        { key: "input_media_type", enum_val: { string_value: ["prompt", "first_frame"], default_val_idx: 0 } },
        { key: "resolution", enum_val: { string_value: ["1080p"], default_val_idx: 0 } },
        { key: "frames", enum_val: { int_value: [120], default_val_idx: 0 } },
        { key: "video_aspect_ratio", enum_val: { string_value: ["16:9"], default_val_idx: 0 } }
      ]
    }
  ]
};

const IMAGE_MODEL: ImageModel = { id: "high_aes_general_v40", name: "Seedream 4.0", provider: "dreamina" };
const INSTRUMENTAL: MusicModel = { id: "instrumental", name: "Dreamina Instrumental", provider: "dreamina" };
const videoModel = (id: string): VideoModel => ({ id, name: id, provider: "dreamina" });

const AUDIO_CONFIG = { song: { model_list: [{ model_req_key: "song_v1", model_name: "Song One", model_status: 0 }] } };

function fakeRunner(history: unknown[]): { calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  let polls = 0;
  setDreaminaPageRunner({
    async evaluate(expression: string) {
      const request = JSON.parse(/const a = (\{.*?\});\n/s.exec(expression)![1]);
      const url = new URL(request.url);
      calls.push({ url, headers: request.headers, body: JSON.parse(request.body) });
      if (url.pathname.includes("audio_generate")) return { ret: "0", data: AUDIO_CONFIG };
      if (url.pathname.includes("video_generate")) return { ret: "0", data: VIDEO_CONFIG };
      if (url.pathname.endsWith("get_common_config")) return { ret: "0", data: CONFIG };
      if (url.pathname.endsWith("aigc_draft/generate")) return { ret: "0", data: {} };
      const submitId = calls.at(-1)!.body.submit_ids[0];
      return { ret: "0", data: { [submitId]: history[Math.min(polls++, history.length - 1)] } };
    }
  });
  return { calls };
}

beforeEach(() => {
  // The default runner reaches a real browser; point it at a socket nobody serves.
  vi.stubEnv("NODETOOL_BROWSER_BRIDGE_SOCKET", "/nonexistent/nodetool-test.sock");
});

afterEach(() => {
  vi.unstubAllEnvs();
  setDreaminaPageRunner(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("DreaminaProvider", () => {
  it("lists the image catalog without touching the browser", async () => {
    setDreaminaPageRunner({ evaluate: () => { throw new Error("listing must not reach the tab"); } });
    const models = await new DreaminaProvider().getAvailableImageModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.find((m) => m.id === "high_aes_general_v40")).toMatchObject({ resolutions: ["2k", "4k"], supportedTasks: ["text_to_image", "image_to_image"] });
    expect(models.find((m) => m.id === "high_aes_general_v30l_art:general_v3.0_18b")?.supportedTasks).toEqual(["text_to_image"]);
  });

  it("signs the request, submits the draft, polls, and downloads the image", async () => {
    vi.useFakeTimers();
    const { calls } = fakeRunner([
      { task: { status: 20 } },
      { task: { status: 50 }, item_list: [{ image: { large_images: [{ image_url: "https://example.com/a.png" }] } }] }
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
    const provider = new DreaminaProvider();
    const models = [IMAGE_MODEL];

    const pending = provider.textToImage({ model: models[0], prompt: "an apple", aspectRatio: "16:9", seed: 7 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(Array.from(await pending)).toEqual([1, 2, 3]);

    const generate = calls.find((c) => c.url.pathname.endsWith("aigc_draft/generate"))!;
    const { sign, "device-time": deviceTime } = generate.headers;
    expect(sign).toBe(createHash("md5").update(`9e2c|enerate|7|8.4.0|${deviceTime}||11ac`).digest("hex"));
    const core = JSON.parse(generate.body.draft_content).component_list[0].abilities.generate.core_param;
    expect(core).toMatchObject({ model: "high_aes_general_v40", prompt: "an apple", seed: 7, image_ratio: 3 });
    expect(core.large_image_info).toMatchObject({ width: 2560, height: 1440, resolution_type: "2k" });
    expect(generate.body.extend.root_model).toBe("high_aes_general_v40");
    expect(calls.filter((c) => c.url.pathname.endsWith("get_history_by_ids"))).toHaveLength(2);
  });

  it("reports a failed task", async () => {
    vi.useFakeTimers();
    fakeRunner([{ task: { status: 30 }, fail_code: "1234", fail_msg: "Bad prompt" }]);
    const provider = new DreaminaProvider();
    const models = [IMAGE_MODEL];
    const pending = provider.textToImage({ model: models[0], prompt: "x" });
    const settled = expect(pending).rejects.toThrow("Bad prompt (fail_code 1234)");
    await vi.advanceTimersByTimeAsync(5_000);
    await settled;
  });

  it("rejects a ratio the model does not offer", async () => {
    fakeRunner([]);
    const provider = new DreaminaProvider();
    const models = [IMAGE_MODEL];
    await expect(provider.textToImage({ model: models[0], prompt: "x", aspectRatio: "21:9" })).rejects.toThrow("does not offer 21:9");
  });

  it("explains the missing extension", async () => {
    await expect(new DreaminaProvider().textToImage({ model: { id: "m", name: "m", provider: "dreamina" }, prompt: "x" })).rejects.toThrow("browser bridge is not running");
  });

  describe("video", () => {
    const videoRecord = { task: { status: 50 }, item_list: [{ video: { transcoded_video: { origin: { video_url: "https://example.com/v.mp4" } } } }] };

    it("lists the video catalog without touching the browser", async () => {
      setDreaminaPageRunner({ evaluate: () => { throw new Error("listing must not reach the tab"); } });
      const models = await new DreaminaProvider().getAvailableVideoModels();
      expect(models.find((m) => m.id === "dreamina_seedance_40_mini")).toEqual({
        id: "dreamina_seedance_40_mini",
        name: "Dreamina Seedance 2.0 Mini",
        provider: "dreamina",
        supportedTasks: ["text_to_video", "image_to_video", "reference_to_video"],
        durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        resolutions: ["720p", "1080p", "2K", "4k"],
        aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]
      });
      expect(models.find((m) => m.id === "dreamina_ic_generate_video_model_vgfm_3.0_fast")?.supportedTasks).toEqual(["text_to_video", "image_to_video"]);
    });

    it("submits a video draft and downloads the result", async () => {
      vi.useFakeTimers();
      const { calls } = fakeRunner([{ task: { status: 20 } }, videoRecord]);
      vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([9, 8]))));
      const provider = new DreaminaProvider();
      const model = videoModel("dreamina_seedance_40_mini");

      const pending = provider.textToVideo({ model, prompt: "a teapot", durationSeconds: 5, aspectRatio: "9:16", resolution: "1080P", seed: 3 });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(Array.from(await pending)).toEqual([9, 8]);

      const generate = calls.find((c) => c.url.pathname.endsWith("aigc_draft/generate"))!;
      const component = JSON.parse(generate.body.draft_content).component_list[0];
      expect(component).toMatchObject({ type: "video_base_component", generate_type: "gen_video", process_type: 1 });
      const params = component.abilities.gen_video.text_to_video_params;
      expect(params).toMatchObject({ model_req_key: "dreamina_seedance_40_mini", video_aspect_ratio: "9:16", seed: 3 });
      expect(params.video_gen_inputs[0]).toMatchObject({ prompt: "a teapot", duration_ms: 5000, resolution: "1080p", fps: 24, video_mode: 2 });
      expect(generate.body.extend.root_model).toBe("dreamina_seedance_40_mini");
    });

    it("uses the model defaults when nothing is requested", async () => {
      vi.useFakeTimers();
      const { calls } = fakeRunner([videoRecord]);
      vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
      const provider = new DreaminaProvider();
      const model = videoModel("dreamina_seedance_40_mini");
      const pending = provider.textToVideo({ model, prompt: "x" });
      await vi.advanceTimersByTimeAsync(5_000);
      await pending;
      const generate = calls.find((c) => c.url.pathname.endsWith("aigc_draft/generate"))!;
      const params = JSON.parse(generate.body.draft_content).component_list[0].abilities.gen_video.text_to_video_params;
      expect(params.video_aspect_ratio).toBe("16:9");
      expect(params.video_gen_inputs[0]).toMatchObject({ duration_ms: 4000, resolution: "720p" });
    });

    it("rejects a duration the model does not offer", async () => {
      fakeRunner([]);
      const provider = new DreaminaProvider();
      const model = videoModel("dreamina_seedance_40_mini");
      await expect(provider.textToVideo({ model, prompt: "x", durationSeconds: 10 })).rejects.toThrow("offers 4, 5, 6 second clips");
    });

    it("reports why Dreamina rejected the output", async () => {
      vi.useFakeTimers();
      fakeRunner([{ task: { status: 30 }, fail_code: "2052", fail_msg: "OutputAudioCopyright" }]);
      const provider = new DreaminaProvider();
      const model = videoModel("dreamina_seedance_40_mini");
      const pending = provider.textToVideo({ model, prompt: "x" });
      const settled = expect(pending).rejects.toThrow("OutputAudioCopyright");
      await vi.advanceTimersByTimeAsync(5_000);
      await settled;
    });

    it("keeps polling through a transient history error", async () => {
      vi.useFakeTimers();
      let polls = 0;
      setDreaminaPageRunner({
        async evaluate(expression: string) {
          const request = JSON.parse(/const a = (\{.*?\});\n/s.exec(expression)![1]);
          const path = new URL(request.url).pathname;
          if (path.includes("video_generate")) return { ret: "0", data: VIDEO_CONFIG };
          if (path.endsWith("aigc_draft/generate")) return { ret: "0", data: {} };
          const submitId = JSON.parse(request.body).submit_ids[0];
          if (polls++ === 0) return { ret: "2008", errmsg: "get history failed" };
          return { ret: "0", data: { [submitId]: videoRecord } };
        }
      });
      vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([5]))));
      const provider = new DreaminaProvider();
      const model = videoModel("dreamina_seedance_40_mini");
      const pending = provider.textToVideo({ model, prompt: "x" });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(Array.from(await pending)).toEqual([5]);
    });
  });

  describe("reference images", () => {
    const videoRecord = { task: { status: 50 }, item_list: [{ video: { transcoded_video: { origin: { video_url: "https://example.com/v.mp4" } } } }] };

    interface Seen { path: string; url: URL; headers: Record<string, string>; body: unknown }

    function referenceRunner(audit: number[] = [1, 1]): { seen: Seen[] } {
      const seen: Seen[] = [];
      setDreaminaPageRunner({
        async evaluate(expression: string) {
          if (expression.includes("window.__ntUp ??=")) return true;
          if (expression.includes("/passport/web/account/info/")) return { data: { user_id_str: "7000000000000000001" } };
          const request = JSON.parse(/const a = (\{.*?\});\n/s.exec(expression)![1]);
          const url = new URL(request.url);
          const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
          seen.push({ path: url.pathname, url, headers: request.headers, body });
          if (url.host.startsWith("imagex")) {
            return url.searchParams.get("Action") === "ApplyImageUpload"
              ? { status: 200, text: JSON.stringify({ Result: { UploadAddress: { StoreInfos: [{ StoreUri: "tos/abc", Auth: "store-auth" }], UploadHosts: ["upload.example.com"], SessionKey: "session" } } }) }
              : { status: 200, text: JSON.stringify({ Result: { PluginResult: [{ ImageUri: `tos/img-${seen.length}`, ImageWidth: 1280, ImageHeight: 720 }] } }) };
          }
          if (url.host === "upload.example.com") return { status: 200, text: "{}" };
          if (url.pathname.includes("video_generate")) return { ret: "0", data: VIDEO_CONFIG };
          if (url.pathname.endsWith("get_upload_token")) return { ret: "0", data: { access_key_id: "AK", secret_access_key: "SK", session_token: "TOKEN", space_name: "space", upload_domain: "imagex.example.com", region: "sg" } };
          if (url.pathname.endsWith("submit_audit_job")) return { ret: "", errmsg: "" };
          if (url.pathname.endsWith("execute_generate_audit")) return { ret: "0", data: { result_list: audit.map((audit_decision) => ({ audit_decision })) } };
          if (url.pathname.endsWith("aigc_draft/generate")) return { ret: "0", data: {} };
          const submitId = (body as { submit_ids: string[] }).submit_ids[0];
          return { ret: "0", data: { [submitId]: videoRecord } };
        }
      });
      vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([7]))));
      return { seen };
    }

    async function render(prompt: string, images = 2, modelId = "dreamina_seedance_40_mini"): Promise<unknown> {
      const provider = new DreaminaProvider();
      const model = videoModel(modelId);
      const pending = provider.referenceToVideo({ images: Array.from({ length: images }, (_, i) => new Uint8Array([i, 1, 2, 3])), videos: [] }, { model, prompt, durationSeconds: modelId === "legacy_model" ? 5 : 4 });
      const settled = pending.then((v) => v, (e: unknown) => e);
      await vi.advanceTimersByTimeAsync(10_000);
      return settled;
    }

    it("uploads each image with signed requests and places it in the prompt", async () => {
      vi.useFakeTimers();
      const { seen } = referenceRunner();
      const result = await render("Open on [Image 1] then cut to [Image 2] slowly.");
      expect(Array.from(result as Uint8Array)).toEqual([7]);

      const apply = seen.find((c) => c.url.searchParams.get("Action") === "ApplyImageUpload")!;
      expect(apply.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AK\/\d{8}\/ap-singapore-1\/imagex\/aws4_request, SignedHeaders=x-amz-date;x-amz-security-token, Signature=[0-9a-f]{64}$/);
      expect(apply.url.searchParams.get("FileSize")).toBe("4");
      const commit = seen.find((c) => c.url.searchParams.get("Action") === "CommitImageUpload")!;
      expect(commit.headers.Authorization).toContain("SignedHeaders=x-amz-content-sha256;x-amz-date;x-amz-security-token");
      const upload = seen.find((c) => c.url.host === "upload.example.com")!;
      expect(upload.headers).toMatchObject({ Authorization: "store-auth", "X-Storage-U": "7000000000000000001" });
      expect(upload.headers["Content-CRC32"]).toMatch(/^[0-9a-f]{8}$/);
      expect(seen.filter((c) => c.path.endsWith("submit_audit_job"))).toHaveLength(2);

      const generate = seen.find((c) => c.path.endsWith("aigc_draft/generate"))!;
      const input = JSON.parse((generate.body as { draft_content: string }).draft_content).component_list[0].abilities.gen_video.text_to_video_params.video_gen_inputs[0];
      expect(input.prompt).toBe("");
      expect(input.unified_edit_input.material_list.map((m: { image_info: { uri: string; width: number } }) => m.image_info.width)).toEqual([1280, 1280]);
      expect(input.unified_edit_input.meta_list).toEqual([
        { meta_type: "text", text: "Open on " },
        { meta_type: "image", text: "", material_ref: { material_idx: 0 } },
        { meta_type: "text", text: " then cut to " },
        { meta_type: "image", text: "", material_ref: { material_idx: 1 } },
        { meta_type: "text", text: " slowly." }
      ]);
    });

    it("leads with the images when the prompt has no markers", async () => {
      vi.useFakeTimers();
      const { seen } = referenceRunner();
      await render("A calm scene.");
      const generate = seen.find((c) => c.path.endsWith("aigc_draft/generate"))!;
      const input = JSON.parse((generate.body as { draft_content: string }).draft_content).component_list[0].abilities.gen_video.text_to_video_params.video_gen_inputs[0];
      expect(input.unified_edit_input.meta_list.map((m: { meta_type: string }) => m.meta_type)).toEqual(["image", "image", "text"]);
    });

    it("stops when Dreamina's review rejects a reference", async () => {
      vi.useFakeTimers();
      const { seen } = referenceRunner([1, 2]);
      expect(String(await render("x"))).toContain("rejected reference image 2");
      expect(seen.some((c) => c.path.endsWith("aigc_draft/generate"))).toBe(false);
    });

    it("rejects a marker that points past the given images", async () => {
      vi.useFakeTimers();
      referenceRunner();
      expect(String(await render("see [Image 3]"))).toContain("only 2 reference image(s)");
    });

    it("rejects references on a model that does not take them", async () => {
      vi.useFakeTimers();
      referenceRunner();
      expect(String(await render("x", 1, "legacy_model"))).toContain("does not take reference images");
    });

    it("rejects more than nine references and reference videos", async () => {
      referenceRunner();
      const provider = new DreaminaProvider();
      const model = videoModel("dreamina_seedance_40_mini");
      const png = new Uint8Array([1]);
      await expect(provider.referenceToVideo({ images: Array(10).fill(png), videos: [] }, { model, prompt: "x" })).rejects.toThrow("at most 9");
      await expect(provider.referenceToVideo({ images: [png], videos: Array(4).fill(png) }, { model, prompt: "x" })).rejects.toThrow("at most 3");
      await expect(provider.referenceToVideo({ images: [png], videos: [], audios: Array(4).fill(png) }, { model, prompt: "x" })).rejects.toThrow("at most 3 reference audios");
      await expect(provider.referenceToVideo({ images: [], videos: [], audios: [png] }, { model, prompt: "x" })).rejects.toThrow("beside it");
      await expect(provider.referenceToVideo({ images: [], videos: [] }, { model, prompt: "x" })).rejects.toThrow("at least one");
    });
  });

  describe("image to video and image to image", () => {
    const videoRecord = { task: { status: 50 }, item_list: [{ video: { transcoded_video: { origin: { video_url: "https://example.com/v.mp4" } } } }] };
    const imageRecord = { task: { status: 50 }, item_list: [{ image: { large_images: [{ image_url: "https://example.com/i.jpg" }] } }] };

    interface Seen { path: string; url: URL; body: any }

    function runner(record: unknown): { seen: Seen[] } {
      const seen: Seen[] = [];
      setDreaminaPageRunner({
        async evaluate(expression: string) {
          if (expression.includes("window.__ntUp ??=")) return true;
          if (expression.includes("/passport/web/account/info/")) return { data: { user_id_str: "7000000000000000001" } };
          const request = JSON.parse(/const a = (\{.*?\});\n/s.exec(expression)![1]);
          const url = new URL(request.url);
          const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
          seen.push({ path: url.pathname, url, body });
          if (url.host.startsWith("imagex")) {
            const action = url.searchParams.get("Action");
            if (action === "ApplyUploadInner") return { status: 200, text: JSON.stringify({ Result: { InnerUploadAddress: { UploadNodes: [{ Vid: "v-pending", UploadHost: "upload.example.com", SessionKey: "vs", StoreInfos: [{ StoreUri: "tos/vid", Auth: "va" }] }] } } }) };
            if (action === "CommitUploadInner") return { status: 200, text: JSON.stringify({ Result: { Results: [{ Vid: `v-${seen.length}`, VideoMeta: { Width: 1280, Height: 720, Duration: 2.5 } }] } }) };
            return action === "ApplyImageUpload"
              ? { status: 200, text: JSON.stringify({ Result: { UploadAddress: { StoreInfos: [{ StoreUri: "tos/abc", Auth: "a" }], UploadHosts: ["upload.example.com"], SessionKey: "s" } } }) }
              : { status: 200, text: JSON.stringify({ Result: { PluginResult: [{ ImageUri: `tos/img-${seen.length}`, ImageWidth: 1920, ImageHeight: 1080 }] } }) };
          }
          if (url.host === "upload.example.com") return { status: 200, text: "{}" };
          if (url.pathname.includes("video_generate")) return { ret: "0", data: VIDEO_CONFIG };
          if (url.pathname.endsWith("get_common_config")) return { ret: "0", data: CONFIG };
          if (url.pathname.endsWith("get_upload_token")) return { ret: "0", data: { access_key_id: "AK", secret_access_key: "SK", session_token: "T", space_name: "space", upload_domain: "imagex.example.com", region: "sg" } };
          if (url.pathname.endsWith("submit_audit_job")) return { ret: "", errmsg: "" };
          if (url.pathname.endsWith("execute_generate_audit")) return { ret: "0", data: { result_list: body.material_list.map(() => ({ audit_decision: 1 })) } };
          if (url.pathname.endsWith("aigc_draft/generate")) return { ret: "0", data: {} };
          return { ret: "0", data: { [body.submit_ids[0]]: record } };
        }
      });
      vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([9]))));
      return { seen };
    }

    async function settle<T>(pending: Promise<T>): Promise<T | unknown> {
      const settled = pending.then((v) => v, (e: unknown) => e);
      await vi.advanceTimersByTimeAsync(10_000);
      return settled;
    }

    const draftOf = (seen: Seen[]) => JSON.parse(seen.find((c) => c.path.endsWith("aigc_draft/generate"))!.body.draft_content).component_list[0];

    it("blends source images into a new image", async () => {
      vi.useFakeTimers();
      const { seen } = runner(imageRecord);
      const provider = new DreaminaProvider();
      const model = IMAGE_MODEL;
      const out = await settle(provider.imageToImage([new Uint8Array([1]), new Uint8Array([2])], { model, prompt: "same scene at night", strength: 0.8, seed: 5 }));
      expect(Array.from(out as Uint8Array)).toEqual([9]);

      const component = draftOf(seen);
      expect(component.generate_type).toBe("blend");
      const blend = component.abilities.blend;
      expect(blend.core_param).toMatchObject({ model: "high_aes_general_v40", prompt: "##same scene at night", sample_strength: 0.8, seed: 5, image_ratio: 3, intelligent_ratio: false });
      expect(blend.core_param.large_image_info).toMatchObject({ width: 2560, height: 1440, resolution_type: "2k" });
      expect(blend.ability_list).toHaveLength(1);
      expect(blend.ability_list[0]).toMatchObject({ name: "byte_edit", strength: 0.8, image_uri_list: ["tos/img-4", "tos/img-12"].map((u) => expect.stringMatching(/^tos\/img-/)) });
      expect(blend.ability_list[0].image_list).toHaveLength(2);
      expect(blend.prompt_placeholder_info_list).toMatchObject([{ ability_index: 0 }]);
      expect(seen.filter((c) => c.path.endsWith("execute_generate_audit"))).toHaveLength(1);
    });

    it("follows the first source image when no ratio is given", async () => {
      vi.useFakeTimers();
      const { seen } = runner(imageRecord);
      const provider = new DreaminaProvider();
      const model = IMAGE_MODEL;
      await settle(provider.imageToImage([new Uint8Array([1])], { model, prompt: "x" }));
      expect(draftOf(seen).abilities.blend.core_param.image_ratio).toBe(3);
    });

    it("rejects image-to-image without sources or on a model without byte_edit", async () => {
      vi.useFakeTimers();
      runner(imageRecord);
      const provider = new DreaminaProvider();
      const model = IMAGE_MODEL;
      await expect(provider.imageToImage([], { model, prompt: "x" })).rejects.toThrow("at least one source image");
      await expect(provider.imageToImage([new Uint8Array([1])], { model: { ...model, id: "edit_only" }, prompt: "x" })).rejects.toThrow("Unknown Dreamina image model");
    });

    it("animates an image from its first frame, with an optional last frame", async () => {
      vi.useFakeTimers();
      const { seen } = runner(videoRecord);
      const provider = new DreaminaProvider();
      const model = videoModel("dreamina_seedance_40_mini");
      const out = await settle(provider.imageToVideo(new Uint8Array([1]), { model, prompt: "push in", endImage: new Uint8Array([2]), durationSeconds: 4 }));
      expect(Array.from(out as Uint8Array)).toEqual([9]);

      const component = draftOf(seen);
      const input = component.abilities.gen_video.text_to_video_params.video_gen_inputs[0];
      expect(input.prompt).toBe("push in");
      expect(input.first_frame_image).toMatchObject({ type: "image", width: 1920, height: 1080 });
      expect(input.end_frame_image).toMatchObject({ type: "image", width: 1920 });
      expect(input.end_frame_image.uri).not.toBe(input.first_frame_image.uri);
      expect(input.ending_control).toBe("1.0");
      expect(input.unified_edit_input).toBeUndefined();
      expect(JSON.parse(component.abilities.gen_video.video_task_extra)).toMatchObject({ functionMode: "first_last_frames", generatorFeature: "firstLastFrames" });
      expect(seen.find((c) => c.path.endsWith("execute_generate_audit"))!.body.material_list).toHaveLength(2);
    });

    it("sends only a first frame when no last frame is given", async () => {
      vi.useFakeTimers();
      const { seen } = runner(videoRecord);
      const provider = new DreaminaProvider();
      const model = videoModel("legacy_model");
      await settle(provider.imageToVideo(new Uint8Array([1]), { model, durationSeconds: 5 }));
      const input = draftOf(seen).abilities.gen_video.text_to_video_params.video_gen_inputs[0];
      expect(input.prompt).toBe("");
      expect(input.first_frame_image).toBeDefined();
      expect(input.end_frame_image).toBeUndefined();
      expect(input.ending_control).toBeUndefined();
    });

    it("uploads reference videos through VOD and places them in the prompt", async () => {
      vi.useFakeTimers();
      const { seen } = runner(videoRecord);
      const provider = new DreaminaProvider();
      const model = videoModel("dreamina_seedance_40_mini");
      const out = await settle(provider.referenceToVideo(
        { images: [new Uint8Array([1])], videos: [new Uint8Array([2, 2]), new Uint8Array([3, 3, 3])] },
        { model, prompt: "Keep [Image 1] and copy the motion of [Video 2] then [Video 1].", durationSeconds: 4 }
      ));
      expect(Array.from(out as Uint8Array)).toEqual([9]);

      const apply = seen.filter((c) => c.url.searchParams.get("Action") === "ApplyUploadInner");
      expect(apply).toHaveLength(2);
      expect(apply[0].url.searchParams.get("FileType")).toBe("video");
      expect(apply[0].url.searchParams.get("SpaceName")).toBe("space");
      expect(apply[0].url.searchParams.get("FileSize")).toBe("2");
      expect(seen.filter((c) => c.url.searchParams.get("Action") === "CommitUploadInner")).toHaveLength(2);
      expect(seen.filter((c) => c.path.endsWith("get_upload_token")).map((c) => c.body.scene)).toEqual([2, 1, 1]);

      const audit = seen.find((c) => c.path.endsWith("execute_generate_audit"))!.body.material_list;
      expect(audit.map((m: { material_type: number }) => m.material_type)).toEqual([1, 2, 2]);
      expect(audit[1].vid).toMatch(/^v-/);

      const input = draftOf(seen).abilities.gen_video.text_to_video_params.video_gen_inputs[0];
      expect(input.prompt).toBe("");
      expect(input.min_version).toBe("3.3.9");
      expect(input.unified_edit_input.material_list.map((m: { material_type: string }) => m.material_type)).toEqual(["image", "video", "video"]);
      expect(input.unified_edit_input.material_list[1].video_info).toMatchObject({ type: "video", source_from: "upload", width: 1280, height: 720, duration: 2500 });
      expect(input.unified_edit_input.meta_list).toEqual([
        { meta_type: "text", text: "Keep " },
        { meta_type: "image", text: "", material_ref: { material_idx: 0 } },
        { meta_type: "text", text: " and copy the motion of " },
        { meta_type: "video", text: "", material_ref: { material_idx: 2 } },
        { meta_type: "text", text: " then " },
        { meta_type: "video", text: "", material_ref: { material_idx: 1 } },
        { meta_type: "text", text: "." }
      ]);
    });

    it("uploads reference audio through VOD and places it in the prompt", async () => {
      vi.useFakeTimers();
      const { seen } = runner(videoRecord);
      const provider = new DreaminaProvider();
      const model = videoModel("dreamina_seedance_40_mini");
      const out = await settle(provider.referenceToVideo(
        { images: [new Uint8Array([1])], videos: [new Uint8Array([2])], audios: [new Uint8Array([3, 3, 3])] },
        { model, prompt: "Show [Image 1] to the beat of [Audio 1] with the motion of [Video 1].", durationSeconds: 4 }
      ));
      expect(Array.from(out as Uint8Array)).toEqual([9]);

      expect(seen.filter((c) => c.url.searchParams.get("Action") === "ApplyUploadInner").map((c) => c.url.searchParams.get("FileType"))).toEqual(["video", "video"]);
      const audit = seen.find((c) => c.path.endsWith("execute_generate_audit"))!.body.material_list;
      expect(audit.map((m: { material_type: number }) => m.material_type)).toEqual([1, 2, 3]);

      const input = draftOf(seen).abilities.gen_video.text_to_video_params.video_gen_inputs[0];
      const materials = input.unified_edit_input.material_list;
      expect(materials.map((m: { material_type: string }) => m.material_type)).toEqual(["image", "video", "audio"]);
      expect(materials[2].audio_info).toMatchObject({ type: "audio", source_from: "upload", duration: 2500 });
      expect(materials[2].audio_info.vid).toMatch(/^v-/);
      expect(input.unified_edit_input.meta_list.filter((m: { meta_type: string }) => m.meta_type !== "text")).toEqual([
        { meta_type: "image", text: "", material_ref: { material_idx: 0 } },
        { meta_type: "audio", text: "", material_ref: { material_idx: 2 } },
        { meta_type: "video", text: "", material_ref: { material_idx: 1 } }
      ]);
    });

    it("rejects an audio marker that points past the given audios", async () => {
      vi.useFakeTimers();
      runner(videoRecord);
      const provider = new DreaminaProvider();
      const model = videoModel("dreamina_seedance_40_mini");
      expect(String(await settle(provider.referenceToVideo({ images: [new Uint8Array([1])], videos: [], audios: [new Uint8Array([3])] }, { model, prompt: "see [Audio 2]", durationSeconds: 4 })))).toContain("only 1 reference audio(s)");
    });

    it("leads with the videos when the prompt has no markers", async () => {
      vi.useFakeTimers();
      const { seen } = runner(videoRecord);
      const provider = new DreaminaProvider();
      const model = videoModel("dreamina_seedance_40_mini");
      await settle(provider.referenceToVideo({ images: [], videos: [new Uint8Array([2])] }, { model, prompt: "A calm lake.", durationSeconds: 4 }));
      const input = draftOf(seen).abilities.gen_video.text_to_video_params.video_gen_inputs[0];
      expect(input.unified_edit_input.meta_list.map((m: { meta_type: string }) => m.meta_type)).toEqual(["video", "text"]);
    });

    it("rejects a video marker that points past the given videos", async () => {
      vi.useFakeTimers();
      runner(videoRecord);
      const provider = new DreaminaProvider();
      const model = videoModel("dreamina_seedance_40_mini");
      expect(String(await settle(provider.referenceToVideo({ images: [], videos: [new Uint8Array([2])] }, { model, prompt: "see [Video 2]", durationSeconds: 4 })))).toContain("only 1 reference video(s)");
    });

    it("rejects a last frame on a model without end_frame", async () => {
      vi.useFakeTimers();
      runner(videoRecord);
      const provider = new DreaminaProvider();
      const model = videoModel("legacy_model");
      await expect(provider.imageToVideo(new Uint8Array([1]), { model, endImage: new Uint8Array([2]), durationSeconds: 5 })).rejects.toThrow("does not take a last frame image");
    });
  });

  describe("music", () => {
    it("declares text_to_music and lists the instrumental model", async () => {
      const provider = new DreaminaProvider();
      expect(provider.getCapabilities()).toContain("text_to_music");
      expect((await provider.getAvailableMusicModels()).map((m) => m.id)).toEqual(["instrumental"]);
    });

    it("signs the draft, polls the history, and downloads the track", async () => {
      vi.useFakeTimers();
      const { calls } = fakeRunner([
        { task: { status: 20 } },
        { task: { status: 50 }, item_list: [{ audio: { origin_audio: { url: "https://example.com/t.wav", format: "wav" } } }] }
      ]);
      vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([9, 8, 7]))));
      const provider = new DreaminaProvider();
      const model = INSTRUMENTAL;

      const pending = provider.textToMusic({ model, prompt: "calm piano", durationSeconds: 12 });
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await pending;
      expect(Array.from(result.data)).toEqual([9, 8, 7]);
      expect(result.mimeType).toBe("audio/wav");

      const generate = calls.find((c) => c.url.pathname.endsWith("aigc_draft/generate"))!;
      const { sign, "device-time": deviceTime } = generate.headers;
      expect(sign).toBe(createHash("md5").update(`9e2c|enerate|7|8.4.0|${deviceTime}||11ac`).digest("hex"));
      const component = JSON.parse(generate.body.draft_content).component_list[0];
      expect(component.generate_type).toBe("generate_instrumental");
      expect(component.abilities.generate_instrumental).toMatchObject({ prompt: "calm piano", duration: 12 });
    });

    it("reports a failed music task with Dreamina's reason", async () => {
      vi.useFakeTimers();
      fakeRunner([{ task: { status: 30 }, fail_code: "1001", fail_msg: "Param" }]);
      const provider = new DreaminaProvider();
      const model = INSTRUMENTAL;
      const pending = provider.textToMusic({ model, prompt: "x" });
      const assertion = expect(pending).rejects.toThrow("Param");
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    });
  });
});
