/**
 * Keyframe, Element and Shot: the structured inputs some video models take
 * beside the prompt. Each node builds one provider-neutral value
 * (`@nodetool-ai/protocol` video-accessories); the provider factories turn it
 * into the model's request shape.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ImageRef, VideoRef } from "@nodetool-ai/node-sdk";
import {
  MAX_ELEMENT_REFERENCE_IMAGES,
  isMediaRefSet,
  readShots,
  readVideoElements,
  type Entity,
  type VideoElement,
  type VideoKeyframe,
  type VideoShot
} from "@nodetool-ai/protocol";
import { resolveEntities, type ProcessingContext } from "@nodetool-ai/runtime";

const emptyImage = (): ImageRef => ({
  type: "image",
  uri: "",
  asset_id: null,
  data: null,
  metadata: null
});

const emptyVideo = (): VideoRef => ({
  type: "video",
  uri: "",
  asset_id: null,
  data: null,
  metadata: null,
  duration: null,
  format: null
});

export class KeyframeNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Keyframe";
  static readonly retrySafe = true;
  static readonly title = "Keyframe";
  static readonly description =
    "Pin an image to a time in a generated video. Connect several Keyframes to a keyframe model such as FLUX 3 Keyframes To Video, which passes through each image at its time.\n    video, keyframe, frame, timing, interpolate, flux";
  static readonly metadataOutputTypes = { output: "keyframe" };
  static readonly inputFields: string[] = ["image"];
  static readonly inlineFields: string[] = ["time"];

  @prop({
    type: "image",
    default: emptyImage(),
    title: "Image",
    description: "The frame the video shows at this time."
  })
  declare image: ImageRef;

  @prop({
    type: "float",
    default: 0,
    title: "Time",
    description:
      "Seconds from the start of the video. Times past the video's duration land on its last frame.",
    min: 0,
    max: 20
  })
  declare time: number;

  async process(): Promise<{ output: VideoKeyframe }> {
    const time = Number(this.time);
    return {
      output: {
        type: "keyframe",
        image: this.image ?? emptyImage(),
        time: Number.isFinite(time) && time > 0 ? time : 0
      }
    };
  }
}

export class ElementNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Element";
  static readonly retrySafe = true;
  static readonly title = "Element";
  static readonly description =
    "A character or object for a video model to keep consistent, such as Kling Elements. Give a frontal image with up to three extra views, or a video. Name it and write @name in the prompt to refer to it, or connect an Entity to use its reference images and voice.\n    video, element, character, object, reference, kling, consistency";
  static readonly metadataOutputTypes = { output: "video_element" };
  static readonly inputFields: string[] = [
    "frontal_image",
    "reference_images",
    "video",
    "entity"
  ];
  static readonly inlineFields: string[] = ["name"];

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description:
      "How the prompt refers to this element, as @name. Without a name, use @Element1, @Element2 in connection order."
  })
  declare name: string;

  @prop({
    type: "image",
    default: emptyImage(),
    title: "Frontal Image",
    description: "A front view of the element."
  })
  declare frontal_image: ImageRef;

  @prop({
    type: "list[image]",
    default: [],
    title: "Reference Images",
    description: "Up to three more views from other angles."
  })
  declare reference_images: ImageRef[];

  @prop({
    type: "video",
    default: emptyVideo(),
    title: "Video",
    description:
      "A 3 to 30 second video of the element, used instead of the images."
  })
  declare video: VideoRef;

  @prop({
    type: "entity",
    default: null,
    title: "Entity",
    description:
      "A library entity. Its reference images, name and voice fill whatever is left empty here."
  })
  declare entity: Entity | null;

  @prop({
    type: "str",
    default: "",
    title: "Voice ID",
    description:
      "A provider voice id bound to the element, for models that voice elements."
  })
  declare voice_id: string;

  async process(
    context?: ProcessingContext
  ): Promise<{ output: VideoElement }> {
    const [entity] = await resolveEntities(
      this.entity ? [this.entity] : [],
      context
    );
    // The frontal image is the first image set: the node's own, then its
    // reference views, then the entity's library images.
    const images = [
      this.frontal_image,
      ...(this.reference_images ?? []),
      ...(entity?.reference_images ?? [])
    ].filter(isMediaRefSet);
    const [element] = readVideoElements([
      {
        name: this.name || entity?.name || "",
        frontal_image: images[0] ?? null,
        reference_images: images.slice(1),
        video: this.video,
        voice_id: this.voice_id || entity?.voice_id || ""
      }
    ]);
    if (!element) {
      throw new Error(
        "Element needs a frontal image, a video, or an Entity with reference images."
      );
    }
    return {
      output: {
        ...element,
        reference_images: element.reference_images.slice(
          0,
          MAX_ELEMENT_REFERENCE_IMAGES
        )
      }
    };
  }
}

export class ShotNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Shot";
  static readonly retrySafe = true;
  static readonly title = "Shot";
  static readonly description =
    "One shot of a multi-shot video, for models such as Kling 3 that take a list of shot prompts. Chain Shots through Previous to set their order, then connect the last one to the model's shot input.\n    video, shot, multi-shot, sequence, prompt, kling";
  static readonly metadataOutputTypes = { output: "list[shot]" };
  static readonly inputFields: string[] = ["previous"];
  static readonly inlineFields: string[] = ["prompt", "duration"];

  @prop({
    type: "list[shot]",
    default: [],
    title: "Previous",
    description: "The shots that play before this one."
  })
  declare previous: VideoShot[];

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "What happens in this shot."
  })
  declare prompt: string;

  @prop({
    type: "float",
    default: 5,
    title: "Duration",
    description: "Seconds this shot lasts.",
    min: 1,
    max: 15
  })
  declare duration: number;

  async process(): Promise<{ output: VideoShot[] }> {
    const prompt = (this.prompt ?? "").trim();
    if (!prompt) {
      throw new Error("Shot needs a prompt.");
    }
    const duration = Number(this.duration);
    return {
      output: [
        ...readShots(this.previous),
        {
          type: "shot",
          prompt,
          duration: Number.isFinite(duration) && duration > 0 ? duration : 5
        }
      ]
    };
  }
}

export const VIDEO_ACCESSORY_NODES = [KeyframeNode, ElementNode, ShotNode] as const;
