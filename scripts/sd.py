import torch
from comfy.nodes import (
    CheckpointLoaderSimple,
    CLIPTextEncode,
    KSampler,
    VAEDecode,
    EmptyLatentImage,
)

from PIL import Image
import numpy as np


# Define the pipeline steps
def run_sd_pipeline(prompt, negative_prompt, steps, cfg, seed, width, height):
    # Step 1: Load the model checkpoint
    checkpoint_loader = CheckpointLoaderSimple()
    model, clip, vae, _ = checkpoint_loader.load_checkpoint(  # type: ignore
        "Realistic_Vision_V6.safetensors"
    )
    # Step 2: Encode the prompt
    clip_text_encode = CLIPTextEncode()
    positive_conditioning = clip_text_encode.encode(clip, prompt)[0]
    negative_conditioning = clip_text_encode.encode(clip, negative_prompt)[0]

    # Step 3: Create an empty latent image
    empty_latent = EmptyLatentImage()
    latent = empty_latent.generate(width, height, 1)[0]

    # Step 4: Run the sampler
    k_sampler = KSampler()
    sampled_latent = k_sampler.sample(
        model,
        seed,
        steps,
        cfg,
        "euler_ancestral",  # Sampler name
        "exponential",  # Scheduler
        positive_conditioning,
        negative_conditioning,
        latent,
    )[0]

    # Step 5: Decode the latent image
    vae_decode = VAEDecode()
    decoded_image = vae_decode.decode(vae, sampled_latent)[0]
    img = Image.fromarray(
        np.clip(decoded_image.squeeze(0).cpu().numpy() * 255, 0, 255).astype(np.uint8)
    )
    return img


# Run the pipeline
if __name__ == "__main__":
    prompt = "A beautiful landscape with mountains and a lake"
    negative_prompt = "ugly, blurry, low quality"
    steps = 5
    cfg = 7.0
    seed = 42
    width = 512
    height = 512

    with torch.inference_mode():
        generated_image = run_sd_pipeline(
            prompt, negative_prompt, steps, cfg, seed, width, height
        )

        generated_image.save("out.png")
