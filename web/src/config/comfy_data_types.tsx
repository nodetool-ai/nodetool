import { DataType } from "./data_types";
import { solarizedColors, monokaiColors } from "./comfy_colors";
import comfy_taesd from "../icons/comfy_taesd.svg?react";
import comfy_clip from "../icons/comfy_clip.svg?react";
import comfy_clip_vision from "../icons/comfy_clip_vision.svg?react";
import comfy_clip_vision_output from "../icons/comfy_clip_vision_output.svg?react";
import comfy_conditioning from "../icons/comfy_conditioning.svg?react";
import comfy_control_net from "../icons/comfy_control_net.svg?react";
import comfy_embeds from "../icons/comfy_embeds.svg?react";
import comfy_gligen from "../icons/comfy_gligen.svg?react";
import comfy_image_tensor from "../icons/comfy_image_tensor.svg?react";
import comfy_insight_face from "../icons/comfy_insight_face.svg?react";
import comfy_ip_adapter from "../icons/comfy_ip_adapter.svg?react";
import comfy_latent from "../icons/comfy_latent.svg?react";
import comfy_mask from "../icons/comfy_mask.svg?react";
import comfy_sampler from "../icons/comfy_sampler.svg?react";
import comfy_sigmas from "../icons/comfy_sigmas.svg?react";
import comfy_style_model from "../icons/comfy_style_model.svg?react";
import comfy_unet from "../icons/comfy_unet.svg?react";
import comfy_vae from "../icons/comfy_vae.svg?react";

export const comfyIconMap: Record<
  string,
  React.FC<React.SVGProps<SVGSVGElement>>
> = {
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
  "comfy.vae": comfy_vae
};

export const COMFY_DATA_TYPES: DataType[] = [
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
    label: "comfy.Conditioning",
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
    label: "Comfy Variational Autoencoder",
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
  }
];
