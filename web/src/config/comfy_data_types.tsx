import { DataType } from "./data_types";
import { solarizedColors, monokaiColors } from "./comfy_colors";

// Existing icons
import comfy_taesd from "../icons/data_types/comfy/comfy_taesd.svg?react";
import comfy_clip from "../icons/data_types/comfy/comfy_clip.svg?react";
import comfy_clip_vision from "../icons/data_types/comfy/comfy_clip_vision.svg?react";
import comfy_clip_vision_output from "../icons/data_types/comfy/comfy_clip_vision_output.svg?react";
import comfy_conditioning from "../icons/data_types/comfy/comfy_conditioning.svg?react";
import comfy_control_net from "../icons/data_types/comfy/comfy_control_net.svg?react";
import comfy_embeds from "../icons/data_types/comfy/comfy_embeds.svg?react";
import comfy_gligen from "../icons/data_types/comfy/comfy_gligen.svg?react";
import comfy_image_tensor from "../icons/data_types/comfy/comfy_image_tensor.svg?react";
import comfy_insight_face from "../icons/data_types/comfy/comfy_insight_face.svg?react";
import comfy_ip_adapter from "../icons/data_types/comfy/comfy_ip_adapter.svg?react";
import comfy_latent from "../icons/data_types/comfy/comfy_latent.svg?react";
import comfy_mask from "../icons/data_types/comfy/comfy_mask.svg?react";
import comfy_sampler from "../icons/data_types/comfy/comfy_sampler.svg?react";
import comfy_sigmas from "../icons/data_types/comfy/comfy_sigmas.svg?react";
import comfy_style_model from "../icons/data_types/comfy/comfy_style_model.svg?react";
import comfy_unet from "../icons/data_types/comfy/comfy_unet.svg?react";
import comfy_vae from "../icons/data_types/comfy/comfy_vae.svg?react";

// New icons — sampling & scheduling
import comfy_noise from "../icons/data_types/comfy/comfy_noise.svg?react";
import comfy_guider from "../icons/data_types/comfy/comfy_guider.svg?react";
import comfy_hooks from "../icons/data_types/comfy/comfy_hooks.svg?react";
import comfy_hook_keyframes from "../icons/data_types/comfy/comfy_hook_keyframes.svg?react";

// New icons — model variants
import comfy_upscale_model from "../icons/data_types/comfy/comfy_upscale_model.svg?react";
import comfy_latent_upscale_model from "../icons/data_types/comfy/comfy_latent_upscale_model.svg?react";
import comfy_latent_operation from "../icons/data_types/comfy/comfy_latent_operation.svg?react";
import comfy_lora_model from "../icons/data_types/comfy/comfy_lora_model.svg?react";
import comfy_model_patch from "../icons/data_types/comfy/comfy_model_patch.svg?react";
import comfy_photomaker from "../icons/data_types/comfy/comfy_photomaker.svg?react";

// New icons — media
import comfy_audio from "../icons/data_types/comfy/comfy_audio.svg?react";
import comfy_video from "../icons/data_types/comfy/comfy_video.svg?react";
import comfy_webcam from "../icons/data_types/comfy/comfy_webcam.svg?react";
import comfy_svg from "../icons/data_types/comfy/comfy_svg.svg?react";

// New icons — 3D
import comfy_mesh from "../icons/data_types/comfy/comfy_mesh.svg?react";
import comfy_voxel from "../icons/data_types/comfy/comfy_voxel.svg?react";
import comfy_load_3d from "../icons/data_types/comfy/comfy_load_3d.svg?react";
import comfy_load_3d_camera from "../icons/data_types/comfy/comfy_load_3d_camera.svg?react";
import comfy_file_3d from "../icons/data_types/comfy/comfy_file_3d.svg?react";

// New icons — spatial & pose
import comfy_pose_keypoint from "../icons/data_types/comfy/comfy_pose_keypoint.svg?react";
import comfy_bounding_box from "../icons/data_types/comfy/comfy_bounding_box.svg?react";
import comfy_camera_control from "../icons/data_types/comfy/comfy_camera_control.svg?react";
import comfy_wan_camera_embedding from "../icons/data_types/comfy/comfy_wan_camera_embedding.svg?react";

// New icons — audio encoder
import comfy_audio_encoder from "../icons/data_types/comfy/comfy_audio_encoder.svg?react";
import comfy_audio_encoder_output from "../icons/data_types/comfy/comfy_audio_encoder_output.svg?react";
import comfy_audio_record from "../icons/data_types/comfy/comfy_audio_record.svg?react";

// New icons — service-specific
import comfy_elevenlabs_voice from "../icons/data_types/comfy/comfy_elevenlabs_voice.svg?react";
import comfy_openai_chat_config from "../icons/data_types/comfy/comfy_openai_chat_config.svg?react";
import comfy_openai_input_files from "../icons/data_types/comfy/comfy_openai_input_files.svg?react";
import comfy_gemini_input_files from "../icons/data_types/comfy/comfy_gemini_input_files.svg?react";
import comfy_luma_concepts from "../icons/data_types/comfy/comfy_luma_concepts.svg?react";
import comfy_luma_ref from "../icons/data_types/comfy/comfy_luma_ref.svg?react";
import comfy_recraft_color from "../icons/data_types/comfy/comfy_recraft_color.svg?react";
import comfy_recraft_controls from "../icons/data_types/comfy/comfy_recraft_controls.svg?react";
import comfy_recraft_v3_style from "../icons/data_types/comfy/comfy_recraft_v3_style.svg?react";
import comfy_pixverse_template from "../icons/data_types/comfy/comfy_pixverse_template.svg?react";

// New icons — task IDs & misc
import comfy_meshy_task_id from "../icons/data_types/comfy/comfy_meshy_task_id.svg?react";
import comfy_model_task_id from "../icons/data_types/comfy/comfy_model_task_id.svg?react";
import comfy_loss_map from "../icons/data_types/comfy/comfy_loss_map.svg?react";
import comfy_timesteps_range from "../icons/data_types/comfy/comfy_timesteps_range.svg?react";
import comfy_tracks from "../icons/data_types/comfy/comfy_tracks.svg?react";
import comfy_matchtype_v3 from "../icons/data_types/comfy/comfy_matchtype_v3.svg?react";

export const comfyIconMap: Record<
  string,
  React.FC<React.SVGProps<SVGSVGElement>>
> = {
  // Existing types
  "comfy.taesd": comfy_taesd,
  "comfy.clip": comfy_clip,
  "comfy.clip_vision": comfy_clip_vision,
  "comfy.clip_vision_output": comfy_clip_vision_output,
  "comfy.conditioning": comfy_conditioning,
  "comfy.control_net": comfy_control_net,
  "comfy.embeds": comfy_embeds,
  "comfy.gligen": comfy_gligen,
  "comfy.image_tensor": comfy_image_tensor,
  "comfy.insight_face": comfy_insight_face,
  "comfy.ip_adapter": comfy_ip_adapter,
  "comfy.latent": comfy_latent,
  "comfy.mask": comfy_mask,
  "comfy.sampler": comfy_sampler,
  "comfy.sigmas": comfy_sigmas,
  "comfy.style_model": comfy_style_model,
  "comfy.unet": comfy_unet,
  "comfy.vae": comfy_vae,
  // Sampling & scheduling
  "comfy.noise": comfy_noise,
  "comfy.guider": comfy_guider,
  "comfy.hooks": comfy_hooks,
  "comfy.hook_keyframes": comfy_hook_keyframes,
  // Model variants
  "comfy.upscale_model": comfy_upscale_model,
  "comfy.latent_upscale_model": comfy_latent_upscale_model,
  "comfy.latent_operation": comfy_latent_operation,
  "comfy.lora_model": comfy_lora_model,
  "comfy.model_patch": comfy_model_patch,
  "comfy.photomaker": comfy_photomaker,
  // Media
  "comfy.audio": comfy_audio,
  "comfy.video": comfy_video,
  "comfy.webcam": comfy_webcam,
  "comfy.svg": comfy_svg,
  // 3D
  "comfy.mesh": comfy_mesh,
  "comfy.voxel": comfy_voxel,
  "comfy.load_3d": comfy_load_3d,
  "comfy.load_3d_camera": comfy_load_3d_camera,
  "comfy.file_3d": comfy_file_3d,
  // Spatial & pose
  "comfy.pose_keypoint": comfy_pose_keypoint,
  "comfy.bounding_box": comfy_bounding_box,
  "comfy.camera_control": comfy_camera_control,
  "comfy.wan_camera_embedding": comfy_wan_camera_embedding,
  // Audio encoder
  "comfy.audio_encoder": comfy_audio_encoder,
  "comfy.audio_encoder_output": comfy_audio_encoder_output,
  "comfy.audio_record": comfy_audio_record,
  // Service-specific
  "comfy.elevenlabs_voice": comfy_elevenlabs_voice,
  "comfy.openai_chat_config": comfy_openai_chat_config,
  "comfy.openai_input_files": comfy_openai_input_files,
  "comfy.gemini_input_files": comfy_gemini_input_files,
  "comfy.luma_concepts": comfy_luma_concepts,
  "comfy.luma_ref": comfy_luma_ref,
  "comfy.recraft_color": comfy_recraft_color,
  "comfy.recraft_controls": comfy_recraft_controls,
  "comfy.recraft_v3_style": comfy_recraft_v3_style,
  "comfy.pixverse_template": comfy_pixverse_template,
  // Task IDs & misc
  "comfy.meshy_task_id": comfy_meshy_task_id,
  "comfy.meshy_rigged_task_id": comfy_meshy_task_id,
  "comfy.model_task_id": comfy_model_task_id,
  "comfy.rig_task_id": comfy_model_task_id,
  "comfy.retarget_task_id": comfy_model_task_id,
  "comfy.loss_map": comfy_loss_map,
  "comfy.timesteps_range": comfy_timesteps_range,
  "comfy.tracks": comfy_tracks,
  "comfy.matchtype_v3": comfy_matchtype_v3,
};

export const COMFY_DATA_TYPES: DataType[] = [
  // ── Existing types ──────────────────────────────────────────────────
  {
    value: "comfy.embeds",
    label: "Comfy Embeddings",
    description: "Vectors that map text to a continuous space",
    color: monokaiColors.purple,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.mask",
    label: "Comfy Mask",
    description: "Image masks",
    color: solarizedColors.base01,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.sigmas",
    label: "Comfy Sigmas",
    description: "Used for Comfy Advanced KSampler",
    color: monokaiColors.comments,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.unet",
    label: "Comfy Model",
    description: "Neural network architecture",
    color: monokaiColors.blue,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.image_tensor",
    label: "Comfy Image",
    description: "Tensor representation of an image",
    color: solarizedColors.blue,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Image"
  },
  {
    value: "comfy.clip",
    label: "Comfy CLIP",
    description: "Model used for CLIP Text Encode",
    color: monokaiColors.yellow,
    textColor: "dark",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.conditioning",
    label: "Comfy Conditioning",
    description: "Diffusion model conditioning",
    color: solarizedColors.orange,
    textColor: "dark",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.sampler",
    label: "Comfy Sampler",
    description: "Sampler to denoise latent images",
    color: monokaiColors.green,
    textColor: "dark",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },
  {
    value: "comfy.control_net",
    label: "Comfy Control Net",
    description: "Guiding models",
    color: solarizedColors.cyan,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },
  {
    value: "comfy.vae",
    label: "Comfy VAE",
    description: "Variational Autoencoder",
    color: monokaiColors.orange,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.latent",
    label: "Comfy Latent",
    description: "Intermediate representations",
    color: monokaiColors.pink,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.clip_vision",
    label: "Comfy CLIP Vision",
    description: "Visual processing component",
    color: solarizedColors.blue,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.clip_vision_output",
    label: "Comfy CLIP Vision Output",
    description: "CLIP model output",
    color: solarizedColors.violet,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Image"
  },
  {
    value: "comfy.gligen",
    label: "Comfy GLIGEN",
    description: "Regional prompts",
    color: monokaiColors.purple,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },
  {
    value: "comfy.ip_adapter",
    label: "Comfy IP Adapter",
    description: "Multimodal image generation",
    color: solarizedColors.magenta,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.insight_face",
    label: "Comfy Insight Face",
    description: "Face analysis",
    color: monokaiColors.blue,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.style_model",
    label: "Comfy Style Model",
    description: "Style application model",
    color: solarizedColors.green,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.taesd",
    label: "Comfy TAESD",
    description: "Tiny Autoencoder for fast previews",
    color: monokaiColors.comments,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },

  // ── Sampling & scheduling ───────────────────────────────────────────
  {
    value: "comfy.noise",
    label: "Comfy Noise",
    description: "Random noise for diffusion sampling",
    color: "#8B8680",
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.guider",
    label: "Comfy Guider",
    description: "Sampling guidance strategy",
    color: monokaiColors.green,
    textColor: "dark",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },
  {
    value: "comfy.hooks",
    label: "Comfy Hooks",
    description: "Model hooks for conditioning modifications",
    color: solarizedColors.violet,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },
  {
    value: "comfy.hook_keyframes",
    label: "Comfy Hook Keyframes",
    description: "Keyframe schedule for hooks",
    color: solarizedColors.violet,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },

  // ── Model variants ──────────────────────────────────────────────────
  {
    value: "comfy.upscale_model",
    label: "Comfy Upscale Model",
    description: "Image upscaling model",
    color: "#4ECDC4",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.latent_upscale_model",
    label: "Comfy Latent Upscale Model",
    description: "Latent space upscaling model",
    color: "#4ECDC4",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.latent_operation",
    label: "Comfy Latent Operation",
    description: "Operation applied to latent representations",
    color: monokaiColors.pink,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },
  {
    value: "comfy.lora_model",
    label: "Comfy LoRA Model",
    description: "Low-Rank Adaptation model weights",
    color: "#E06C75",
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.model_patch",
    label: "Comfy Model Patch",
    description: "Patch applied to modify a model",
    color: monokaiColors.blue,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.photomaker",
    label: "Comfy PhotoMaker",
    description: "PhotoMaker identity customization",
    color: solarizedColors.magenta,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Image"
  },

  // ── Media types ─────────────────────────────────────────────────────
  {
    value: "comfy.audio",
    label: "Comfy Audio",
    description: "Audio data for processing or playback",
    color: "#56B6C2",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "Audiotrack"
  },
  {
    value: "comfy.video",
    label: "Comfy Video",
    description: "Video data for processing or playback",
    color: "#C678DD",
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Videocam"
  },
  {
    value: "comfy.webcam",
    label: "Comfy Webcam",
    description: "Webcam capture input",
    color: "#56B6C2",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "Videocam"
  },
  {
    value: "comfy.svg",
    label: "Comfy SVG",
    description: "SVG vector graphics",
    color: monokaiColors.green,
    textColor: "dark",
    name: "",
    slug: "",
    namespace: "",
    icon: "Image"
  },

  // ── 3D types ────────────────────────────────────────────────────────
  {
    value: "comfy.mesh",
    label: "Comfy Mesh",
    description: "3D mesh geometry",
    color: "#98C379",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.voxel",
    label: "Comfy Voxel",
    description: "3D voxel data",
    color: "#98C379",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.load_3d",
    label: "Comfy Load 3D",
    description: "3D scene data",
    color: "#98C379",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.load_3d_camera",
    label: "Comfy 3D Camera",
    description: "3D camera configuration",
    color: "#98C379",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },
  {
    value: "comfy.file_3d",
    label: "Comfy 3D File",
    description: "3D file (GLB, OBJ, FBX, etc.)",
    color: "#98C379",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },

  // ── Spatial & pose ──────────────────────────────────────────────────
  {
    value: "comfy.pose_keypoint",
    label: "Comfy Pose Keypoint",
    description: "Body pose keypoint data",
    color: "#E5C07B",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.bounding_box",
    label: "Comfy Bounding Box",
    description: "Bounding box coordinates",
    color: "#E5C07B",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.camera_control",
    label: "Comfy Camera Control",
    description: "Camera control parameters",
    color: "#E5C07B",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },
  {
    value: "comfy.wan_camera_embedding",
    label: "Comfy WAN Camera Embedding",
    description: "Camera embedding for WAN video generation",
    color: "#E5C07B",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },

  // ── Audio encoder ───────────────────────────────────────────────────
  {
    value: "comfy.audio_encoder",
    label: "Comfy Audio Encoder",
    description: "Audio encoding model",
    color: "#56B6C2",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "ModelTraining"
  },
  {
    value: "comfy.audio_encoder_output",
    label: "Comfy Audio Encoder Output",
    description: "Encoded audio output",
    color: "#56B6C2",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.audio_record",
    label: "Comfy Audio Record",
    description: "Recorded audio input",
    color: "#56B6C2",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "Audiotrack"
  },

  // ── Service-specific ────────────────────────────────────────────────
  {
    value: "comfy.elevenlabs_voice",
    label: "Comfy ElevenLabs Voice",
    description: "ElevenLabs voice selection",
    color: "#D19A66",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "Audiotrack"
  },
  {
    value: "comfy.openai_chat_config",
    label: "Comfy OpenAI Chat Config",
    description: "OpenAI chat configuration",
    color: "#61AFEF",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },
  {
    value: "comfy.openai_input_files",
    label: "Comfy OpenAI Input Files",
    description: "Files for OpenAI API input",
    color: "#61AFEF",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.gemini_input_files",
    label: "Comfy Gemini Input Files",
    description: "Files for Gemini API input",
    color: "#61AFEF",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.luma_concepts",
    label: "Comfy Luma Concepts",
    description: "Luma AI concept parameters",
    color: "#C678DD",
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },
  {
    value: "comfy.luma_ref",
    label: "Comfy Luma Reference",
    description: "Luma AI reference input",
    color: "#C678DD",
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Image"
  },
  {
    value: "comfy.recraft_color",
    label: "Comfy Recraft Color",
    description: "Recraft color parameter",
    color: "#E06C75",
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.recraft_controls",
    label: "Comfy Recraft Controls",
    description: "Recraft generation controls",
    color: "#E06C75",
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },
  {
    value: "comfy.recraft_v3_style",
    label: "Comfy Recraft V3 Style",
    description: "Recraft V3 style preset",
    color: "#E06C75",
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },
  {
    value: "comfy.pixverse_template",
    label: "Comfy PixVerse Template",
    description: "PixVerse video generation template",
    color: "#C678DD",
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },

  // ── Task IDs & misc ─────────────────────────────────────────────────
  {
    value: "comfy.meshy_task_id",
    label: "Comfy Meshy Task",
    description: "Meshy 3D generation task reference",
    color: "#98C379",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.meshy_rigged_task_id",
    label: "Comfy Meshy Rigged Task",
    description: "Meshy rigged model task reference",
    color: "#98C379",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.model_task_id",
    label: "Comfy Model Task",
    description: "3D model generation task reference",
    color: "#98C379",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.rig_task_id",
    label: "Comfy Rig Task",
    description: "Rigging task reference",
    color: "#98C379",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.retarget_task_id",
    label: "Comfy Retarget Task",
    description: "Animation retargeting task reference",
    color: "#98C379",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.loss_map",
    label: "Comfy Loss Map",
    description: "Loss map for training guidance",
    color: monokaiColors.comments,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.timesteps_range",
    label: "Comfy Timesteps Range",
    description: "Range of timesteps for scheduling",
    color: monokaiColors.comments,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "Functions"
  },
  {
    value: "comfy.tracks",
    label: "Comfy Tracks",
    description: "Motion tracking data",
    color: "#E5C07B",
    textColor: "#111",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
  {
    value: "comfy.matchtype_v3",
    label: "Comfy Match Type",
    description: "V3 type matching placeholder",
    color: monokaiColors.comments,
    textColor: "#fff",
    name: "",
    slug: "",
    namespace: "",
    icon: "DataObject"
  },
];
