import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  getApiKey,
  kieExecuteTask,
  isRefSet,
  uploadImageInput,
  uploadAudioInput,
  uploadVideoInput,
} from "../kie-base.js";

export class Kling26TextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Kling26TextToVideo";
  static readonly title = "Kling 2.6 Text to Video";
  static readonly description = `Kling 2.6 Text to Video via Kie.ai.

    kie, video, ai

    ## Query Task Status`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly inlineFields = [];
  static readonly inputFields = ["prompt"];

  @prop({ type: "str", default: "", title: "Prompt", description: "Text prompt for video generation (maximum length: 1000 characters)", max: 1000 })
  declare prompt: any;

  @prop({ type: "bool", default: false, title: "Sound", description: "This parameter specifies whether the generated video contains sound (boolean: true/false)" })
  declare sound: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1","16:9","9:16"], title: "Aspect Ratio", description: "This parameter defines the video aspect ratio" })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "5", values: ["5","10"], title: "Duration", description: "Video duration (unit: seconds)" })
  declare duration: any;

  async process(context?: Parameters<BaseNode["process"]>[0]): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim()) throw new Error("Prompt is required");
    if (!String(this.aspect_ratio ?? "").trim()) throw new Error("Aspect Ratio is required");
    if (!String(this.duration ?? "").trim()) throw new Error("Duration is required");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["sound"] = Boolean(this.sound ?? false);
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    params["duration"] = String(this.duration ?? "5");

    const result = await kieExecuteTask(apiKey, "kling-2.6/text-to-video", params, 8000, 450);
    return { output: { type: "video", data: result.data } };
  }
}

export class Kling30OmniTextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Kling30OmniTextToVideo";
  static readonly title = "Kling 3.0 Omni Text to Video";
  static readonly description = `Kling 3.0 Omni Text to Video via Kie.ai.

    kie, video, ai

    ## Query Task Status`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly inlineFields = [];
  static readonly inputFields = ["prompt"];

  @prop({ type: "str", default: "", title: "Prompt", description: "Text description of the video. It must not be empty after leading and trailing whitespace is removed, and must not exceed 3,072 characters.", min: 1, max: 3072 })
  declare prompt: any;

  @prop({ type: "bool", default: true, title: "Customize Multi Shots", description: "Whether to enable multi-shot mode. Explicitly specifying this value is recommended. 'true' enables multiple shots; 'false' uses a single shot." })
  declare customize_multi_shots: any;

  @prop({ type: "bool", default: false, title: "Prefer Multi Shots", description: "Whether to enable intelligent shot planning. This field is mutually exclusive with 'customize_multi_shots'. Both fields may be 'false', but they cannot both be 'true'." })
  declare prefer_multi_shots: any;

  @prop({ type: "list[dict]", default: [], title: "Multi Prompt", description: "List of custom shots. When 'customize_multi_shots' is 'true', this field is required, must not be empty, and supports up to 6 shots. When 'customize_multi_shots' is 'false', it must be an empty array or omitted.", max: 6 })
  declare multi_prompt: any;

  @prop({ type: "list[dict]", default: [], title: "Elements", description: "List of one-time subject assets. The default is an empty array. When using only multi-image subjects, up to 7 subjects can be uploaded. When using only video character subjects, the number of video character subjects must not exceed 3. When using both video character and multi-image subjects, the number of video character subjects must not exceed 3, and the number of multi-image subjects must not exceed 4." })
  declare elements: any;

  @prop({ type: "bool", default: false, title: "Audio", description: "Whether to add audio to the generated video. 'true' enables audio; 'false' disables audio." })
  declare audio: any;

  @prop({ type: "enum", default: "720p", values: ["720p","1080p","4k"], title: "Resolution", description: "Resolution of the generated video. Available values are '720p' (outputs a 720p video), '1080p' (outputs a 1080p video), and '4k' (outputs a 4K video)." })
  declare resolution: any;

  @prop({ type: "enum", default: "16:9", values: ["16:9","9:16","1:1"], title: "Aspect Ratio", description: "Aspect ratio of the generated video. Supported values are '16:9', '9:16', and '1:1'." })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 5, title: "Duration", description: "Total video duration in seconds. The supported range is 3 to 15 seconds, and the default is 5 seconds.", min: 3, max: 15 })
  declare duration: any;

  async process(context?: Parameters<BaseNode["process"]>[0]): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim()) throw new Error("Prompt is required");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["customize_multi_shots"] = Boolean(this.customize_multi_shots ?? true);
    params["prefer_multi_shots"] = Boolean(this.prefer_multi_shots ?? false);
    const multiPromptList = Array.isArray(this.multi_prompt) ? this.multi_prompt : [];
    if (multiPromptList.length) params["multi_prompt"] = multiPromptList;
    const elementsList = Array.isArray(this.elements) ? this.elements : [];
    if (elementsList.length) params["elements"] = elementsList;
    params["audio"] = Boolean(this.audio ?? false);
    params["resolution"] = String(this.resolution ?? "720p");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");
    params["duration"] = Number(this.duration ?? 5);

    const result = await kieExecuteTask(apiKey, "kling-3.0-omni/text-to-video", params, 8000, 450);
    return { output: { type: "video", data: result.data } };
  }
}

export class Wan30VideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Wan30Video";
  static readonly title = "Wan 3.0 - Video";
  static readonly description = `Wan 3.0 - Video via Kie.ai.

    kie, video, ai

    ## Create Task`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly inlineFields = [];
  static readonly inputFields = ["prompt","first_frame","last_frame","reference_images","reference_videos","reference_audios"];

  @prop({ type: "str", default: "", title: "Prompt", description: "Text prompt, supporting both Chinese and English. Up to 20,000 characters; excess characters will be truncated automatically. Required for text-to-video generation; for other modes, it is recommended to provide it together with media. In reference mode, use Image1/Video1/Audio1 to reference the provided media.", max: 20000 })
  declare prompt: any;

  @prop({ type: "image", default: {"type":"image","uri":"","asset_id":null,"data":null,"metadata":null}, title: "First Frame", description: "URL of the first-frame image. Up to 1 image, used strictly as the first frame of the video. Used for first-frame-to-video / first-and-last-frame-to-video generation. Cannot be provided together with 'reference_*_urls'. Formats: JPEG/JPG, PNG (transparency not supported), BMP, WEBP; each side [240, 8000] px; aspect ratio ≤ 8:1; ≤ 20MB." })
  declare first_frame: any;

  @prop({ type: "image", default: {"type":"image","uri":"","asset_id":null,"data":null,"metadata":null}, title: "Last Frame", description: "URL of the first-frame image. Up to 1 image, used strictly as the first frame of the video. Used for first-frame-to-video / first-and-last-frame-to-video generation. Cannot be provided together with 'reference_*_urls'. Formats: JPEG/JPG, PNG (transparency not supported), BMP, WEBP; each side [240, 8000] px; aspect ratio ≤ 8:1; ≤ 20MB." })
  declare last_frame: any;

  @prop({ type: "list[image]", default: [], title: "Reference Images", description: "Reference images for the all-purpose reference mode, with up to 10 images. Correspond to Image1, Image2, … in the prompt according to array order. Specifications are the same as 'first_frame_url'. Cannot be provided together with the first-frame/last-frame parameters.", max: 10 })
  declare reference_images: any;

  @prop({ type: "list[video]", default: [], title: "Reference Videos", description: "Reference videos for the all-purpose reference mode, with up to 5 clips. Each clip must be 1–15 seconds, with a total duration ≤ 15 seconds. Correspond to Video1, Video2, … according to array order. Formats: mp4, mov; each side [240, 4096] px; aspect ratio ≤ 8:1; each file ≤ 100MB. There is an additional constraint on the output side: the input video duration + 'duration' must not exceed 30 seconds.", max: 5 })
  declare reference_videos: any;

  @prop({ type: "list[audio]", default: [], title: "Reference Audios", description: "Reference audio for the all-purpose reference mode, with up to 5 clips. Each clip must be 1–15 seconds, with a total duration ≤ 15 seconds. Correspond to Audio1, Audio2, … according to array order. Formats: wav, mp3; ≤ 15MB. Audio should not be used alone as the only media input; pairing it with an image or video is still recommended.", max: 5 })
  declare reference_audios: any;

  @prop({ type: "list[str]", default: [], title: "Reference File Urls", description: "File-to-video generation. Up to 1 file. Cannot be provided together with 'reference_link_urls', or with the first-frame/last-frame parameters. Formats: docx/doc/xlsx/xls/pptx/ppt/pdf/txt/key/pages/numbers/md; ≤ 100MB; pdf/docx/ppt/key/pages, etc. ≤ 50 pages.", max: 1 })
  declare reference_file_urls: any;

  @prop({ type: "list[str]", default: [], title: "Reference Link Urls", description: "Link-to-video generation. Up to 1 publicly accessible webpage that does not require login. Cannot be provided together with 'reference_file_urls', or with the first-frame/last-frame parameters.", max: 1 })
  declare reference_link_urls: any;

  @prop({ type: "enum", default: "1080P", values: ["480P","720P","1080P"], title: "Resolution", description: "Output resolution. Default: **1080P**." })
  declare resolution: any;

  @prop({ type: "enum", default: "adaptive", values: ["adaptive","16:9","4:3","1:1","3:4","9:16"], title: "Aspect Ratio", description: "Output aspect ratio. 'adaptive' (default) automatically selects the ratio based on the input media and intent." })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 5, title: "Duration", description: "Output video duration in seconds. Default: 5. Without video input, the range is [2, 30]. With reference videos: input video duration + output duration ≤ 30. Pass '-1' to use an intelligent duration determined by the model.", min: 2, max: 30 })
  declare duration: any;

  @prop({ type: "bool", default: true, title: "Audio", description: "Whether the output video includes an audio track. Default: true." })
  declare audio: any;

  @prop({ type: "int", default: 0, title: "Seed", description: "Random seed used to reproduce results. If omitted, a random seed will be used.", min: 0, max: 2147483647 })
  declare seed: any;

  @prop({ type: "bool", default: false, title: "Nsfw Checker", description: "Defaults to false. You can set it to false based on your needs. If set to false, our content filtering will be disabled, and all results will be returned directly by the model itself. Note: There is no guarantee that everything can be filtered out; if you are not satisfied with the results, you will need to make your own arrangements." })
  declare nsfw_checker: any;

  async process(context?: Parameters<BaseNode["process"]>[0]): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    let firstFrameUrl = "";
    if (isRefSet(this.first_frame)) firstFrameUrl = await uploadImageInput(apiKey, this.first_frame, context);
    let lastFrameUrl = "";
    if (isRefSet(this.last_frame)) lastFrameUrl = await uploadImageInput(apiKey, this.last_frame, context);
    const referenceImagesUrls: string[] = [];
    const referenceImagesList = Array.isArray(this.reference_images) ? this.reference_images : [];
    for (const item of referenceImagesList) {
      if (isRefSet(item)) referenceImagesUrls.push(await uploadImageInput(apiKey, item, context));
    }
    const referenceVideosUrls: string[] = [];
    const referenceVideosList = Array.isArray(this.reference_videos) ? this.reference_videos : [];
    for (const item of referenceVideosList) {
      if (isRefSet(item)) referenceVideosUrls.push(await uploadVideoInput(apiKey, item, context));
    }
    const referenceAudiosUrls: string[] = [];
    const referenceAudiosList = Array.isArray(this.reference_audios) ? this.reference_audios : [];
    for (const item of referenceAudiosList) {
      if (isRefSet(item)) referenceAudiosUrls.push(await uploadAudioInput(apiKey, item, context));
    }
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    const referenceFileUrlsList = Array.isArray(this.reference_file_urls) ? this.reference_file_urls : [];
    if (referenceFileUrlsList.length) params["reference_file_urls"] = referenceFileUrlsList;
    const referenceLinkUrlsList = Array.isArray(this.reference_link_urls) ? this.reference_link_urls : [];
    if (referenceLinkUrlsList.length) params["reference_link_urls"] = referenceLinkUrlsList;
    params["resolution"] = String(this.resolution ?? "1080P");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "adaptive");
    params["duration"] = Number(this.duration ?? 5);
    params["audio"] = Boolean(this.audio ?? true);
    params["seed"] = Number(this.seed ?? 0);
    params["nsfw_checker"] = Boolean(this.nsfw_checker ?? false);
    if (firstFrameUrl) params["first_frame_url"] = firstFrameUrl;
    if (lastFrameUrl) params["last_frame_url"] = lastFrameUrl;
    if (referenceImagesUrls.length) params["reference_image_urls"] = referenceImagesUrls;
    if (referenceVideosUrls.length) params["reference_video_urls"] = referenceVideosUrls;
    if (referenceAudiosUrls.length) params["reference_audio_urls"] = referenceAudiosUrls;

    const result = await kieExecuteTask(apiKey, "wan/3-0-video", params, 8000, 450);
    return { output: { type: "video", data: result.data } };
  }
}

export class HappyhorseReferenceToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.HappyhorseReferenceToVideo";
  static readonly title = "happyhorse/reference-to-video";
  static readonly description = `happyhorse/reference-to-video via Kie.ai.

    kie, video, ai

    ## Query Task Status`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly inlineFields = [];
  static readonly inputFields = ["prompt","reference_image"];

  @prop({ type: "str", default: "", title: "Prompt", description: "Text prompt describing the video to generate (any language). Max 5,000 non‑Chinese characters or 2,500 Chinese characters; extra content is truncated.", max: 5000 })
  declare prompt: any;

  @prop({ type: "list[image]", default: [], title: "Reference Image", description: "Reference image URL list. Provide 1–9 images. The order defines which image is character1, character2, etc. Image limits: Format: JPEG, JPG, PNG, and WEBP. Resolution: shortest side at least 400 px. 720P or higher recommended. Avoid small, blurry, or heavily compressed images, as they degrade output quality. File size: 10 MB maximum.", min: 1, max: 9 })
  declare reference_image: any;

  @prop({ type: "enum", default: "1080p", values: ["720p","1080p"], title: "Resolution", description: "Output video resolution. Valid values: 720P, 1080P (default)." })
  declare resolution: any;

  @prop({ type: "enum", default: "16:9", values: ["16:9","9:16","1:1","4:3","3:4"], title: "Aspect Ratio", description: "Output aspect ratio. Valid values: 16:9 (default), 9:16, 1:1, 4:3, 3:4." })
  declare aspect_ratio: any;

  @prop({ type: "int", default: 5, title: "Duration", description: "Output duration in seconds (integer). Must be between 3 and 15. Defaults to 5.", min: 3, max: 15 })
  declare duration: any;

  @prop({ type: "int", default: 0, title: "Seed", description: "Random seed for reproducibility (if supported).", min: 0, max: 2147483647 })
  declare seed: any;

  async process(context?: Parameters<BaseNode["process"]>[0]): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim()) throw new Error("Prompt is required");
    const referenceImageUrls: string[] = [];
    const referenceImageList = Array.isArray(this.reference_image) ? this.reference_image : [];
    for (const item of referenceImageList) {
      if (isRefSet(item)) referenceImageUrls.push(await uploadImageInput(apiKey, item, context));
    }
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["resolution"] = String(this.resolution ?? "1080p");
    params["aspect_ratio"] = String(this.aspect_ratio ?? "16:9");
    params["duration"] = Number(this.duration ?? 5);
    params["seed"] = Number(this.seed ?? 0);
    if (referenceImageUrls.length) params["reference_image"] = referenceImageUrls;

    const result = await kieExecuteTask(apiKey, "happyhorse/reference-to-video", params, 8000, 450);
    return { output: { type: "video", data: result.data } };
  }
}

export const KIE_VIDEO_NODES: readonly NodeClass[] = [
  Kling26TextToVideoNode,
  Kling30OmniTextToVideoNode,
  Wan30VideoNode,
  HappyhorseReferenceToVideoNode,
] as const;
