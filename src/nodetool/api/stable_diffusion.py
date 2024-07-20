import torch
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from PIL import Image
import io
import base64
import numpy as np
import comfy.cli_args

gpu_available = torch.cuda.is_available() or torch.backends.mps.is_available()

print(f"GPU available: {gpu_available}")

comfy.cli_args.args.force_fp16 = True
comfy.cli_args.args.cpu = not gpu_available

import comfy.model_management as model_management
from comfy.nodes import (
    CheckpointLoaderSimple,
    CLIPTextEncode,
    KSampler,
    VAEDecode,
    EmptyLatentImage,
)


app = FastAPI()

# Global variables to store loaded models
global_model = None
global_clip = None
global_vae = None


# Load models on startup
@app.on_event("startup")
async def startup_event():
    global global_model, global_clip, global_vae
    checkpoint_loader = CheckpointLoaderSimple()
    with torch.inference_mode():
        global_model, global_clip, global_vae, _ = checkpoint_loader.load_checkpoint(  # type: ignore
            "Realistic_Vision_V6.safetensors"
        )
    # Offload models to CPU initially
    model_management.cleanup_models()


# Pydantic model for request body
class SDRequest(BaseModel):
    prompt: str
    negative_prompt: str
    steps: int
    cfg: float
    seed: int
    width: int
    height: int


@app.post("/generate")
async def generate_image(request: SDRequest, background_tasks: BackgroundTasks):
    global global_model, global_clip, global_vae
    print(f"VRAM: {torch.cuda.memory_allocated(0) / 1024 / 1024 / 1024}")

    try:
        with torch.inference_mode():
            model_management.load_models_gpu([global_model])

            # Step 2: Encode the prompt
            clip_text_encode = CLIPTextEncode()
            positive_conditioning = clip_text_encode.encode(
                global_clip, request.prompt
            )[0]
            negative_conditioning = clip_text_encode.encode(
                global_clip, request.negative_prompt
            )[0]

            # Step 3: Create an empty latent image
            empty_latent = EmptyLatentImage()
            latent = empty_latent.generate(request.width, request.height, 1)[0]

            # Step 4: Run the sampler
            k_sampler = KSampler()
            sampled_latent = k_sampler.sample(
                global_model,
                request.seed,
                request.steps,
                request.cfg,
                "euler_ancestral",  # Sampler name
                "exponential",  # Scheduler
                positive_conditioning,
                negative_conditioning,
                latent,
            )[0]

            # Step 5: Decode the latent image
            vae_decode = VAEDecode()
            decoded_image = vae_decode.decode(global_vae, sampled_latent)[0]
            img = Image.fromarray(
                np.clip(decoded_image.squeeze(0).cpu().numpy() * 255, 0, 255).astype(
                    np.uint8
                )
            )

        # Convert PIL Image to base64 string
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode()

        # Cleanup models (offload to CPU) after processing
        background_tasks.add_task(model_management.cleanup_models)

        return {"image": img_str}

    except Exception as e:
        # Ensure models are cleaned up even if an error occurs
        background_tasks.add_task(model_management.cleanup_models)
        raise e


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
