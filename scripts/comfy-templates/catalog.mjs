// Bindings refer to the upstream API prompt's node ids and input names.
export const REVISION = "1ae390968e323dba24a6991d1860ded051f5a79b";
export const TEMPLATES = [
  { source: "image_z_image_turbo", name: "Z-Image Turbo", task: "text_to_image", prompt: [["57:27", "text"]], seeds: [["57:3", "seed"]], size: "57:13", multiple: 16, output: "9" },
  { source: "image_krea2_turbo_t2i_int8", name: "Krea 2 Turbo", task: "text_to_image", prompt: [["30:19", "value"]], seeds: [["30:3", "seed"], ["30:16", "sampling_mode.seed"]], size: "30:5", multiple: 8, output: "29" },
  { source: "image_moss_image_t2i", name: "MOSS Image", task: "text_to_image", prompt: [["18:17", "value"]], seeds: [["18:7", "seed"], ["18:11", "sampling_mode.seed"]], size: "18:6", multiple: 16, output: "9" },
  { source: "image_qwen_image_2_1_t2i", name: "Qwen Image 2.1", task: "text_to_image", prompt: [["459:474", "on_false"], ["459:471", "prompt"]], seeds: [["459:458", "seed"], ["459:471", "sampling_mode.seed"]], size: "459:456", multiple: 8, output: "461" },
  { source: "video_hunyuan_video_1.5_720p_t2v", name: "Hunyuan Video 1.5", task: "text_to_video", prompt: [["44", "text"]], seeds: [["129", "noise_seed"]], size: "124", multiple: 16, output: "102", fps: 24, maxFrames: 121, grid: 4, offset: 1, width: 1280, height: 720 },
  { source: "video_wan2_2_14B_t2v", name: "Wan 2.2 T2V A14B", task: "text_to_video", prompt: [["128:89", "text"]], seeds: [["128:81", "noise_seed"]], size: "128:74", multiple: 16, output: "80", fps: 16, maxFrames: 81, grid: 4, offset: 1, width: 832, height: 480 },
  { source: "video_minimax_h3_t2v", name: "MiniMax H3 T2V", task: "text_to_video", prompt: [["140:131", "prompt"]], seeds: [["140:129", "noise_seed"]], size: "140:131", multiple: 32, output: "92", fps: 24, maxFrames: 362, grid: 17, offset: 5, width: 864, height: 480, restricted: true },
  { source: "video_fastvideo_fasth3_t2v", name: "FastVideo FastH3", task: "text_to_video", prompt: [["105:104", "prompt"]], seeds: [["105:15", "noise_seed"]], size: "105:104", multiple: 32, output: "92", fps: 24, maxFrames: 362, grid: 17, offset: 5, width: 864, height: 480, restricted: true },
  { source: "audio_ace_step1_5_xl_turbo", name: "ACE-Step 1.5 XL Turbo", task: "text_to_audio", prompt: [["94", "tags"]], output: "111" },
  { source: "audio_minimax_music_3", name: "MiniMax Music 3", task: "text_to_audio", prompt: [["37:13", "caption"]], output: "35" },
  { source: "audio_stable_audio_3_medium", name: "Stable Audio 3 Medium", task: "text_to_audio", prompt: [["52:31", "value"]], output: "57" },
  { source: "audio_yue2_text2music", name: "YuE 2", task: "text_to_audio", prompt: [["33:36", "value"]], output: "10" }
];
