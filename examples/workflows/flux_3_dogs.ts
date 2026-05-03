import { workflow, createNode, type SingleOutput } from "@nodetool-ai/dsl";
import type { ImageRef } from "@nodetool-ai/dsl";

function fluxDev(inputs: { prompt: string; image_size?: string }) {
  return createNode<SingleOutput<ImageRef>>("fal.text_to_image.FluxDev", inputs as Record<string, unknown>);
}

const dog1 = fluxDev({
  prompt: "A golden retriever playing fetch in a sunny park, photorealistic",
  image_size: "square_hd",
});

const dog2 = fluxDev({
  prompt: "A husky with blue eyes sitting in fresh snow, photorealistic",
  image_size: "square_hd",
});

const dog3 = fluxDev({
  prompt: "A corgi running on a beach at sunset, photorealistic",
  image_size: "square_hd",
});

const wf = workflow(dog1, dog2, dog3);
console.log(JSON.stringify(wf));
