import base64
import io
from typing import Optional

import PIL.Image
import pandas as pd
from pydub import AudioSegment


def decode_bytes_io(encoded: str) -> io.BytesIO:
    """
    base64 decode an image.
    """
    image_bytes = base64.b64decode(encoded)
    bytes_io = io.BytesIO(image_bytes)
    return bytes_io


def encode_bytes(b: bytes) -> str:
    """
    base64 encode bytes
    """
    return base64.b64encode(b).decode("utf-8")


def encode_image(image: PIL.Image.Image, format: str = "png") -> str:
    """
    base64 encode an image.
    """
    buffered = io.BytesIO()
    image.save(buffered, format=format)
    return base64.b64encode(buffered.getvalue()).decode("utf-8")


def decode_image(image: str) -> PIL.Image.Image:
    """
    base64 decode an image.
    """
    image_bytes = base64.b64decode(image)
    return PIL.Image.open(io.BytesIO(image_bytes))


def encode_audio(audio: AudioSegment, format: str = "mp3") -> str:
    """
    base64 encode an audio.
    """
    buffered = io.BytesIO()
    audio.export(buffered, format=format)
    return base64.b64encode(buffered.getvalue()).decode("utf-8")


def decode_audio(audio: str) -> AudioSegment:
    """
    base64 decode an audio.
    """
    audio_bytes = base64.b64decode(audio)
    return AudioSegment.from_file(io.BytesIO(audio_bytes), format="mp3")


# def encode_latents(
#     vae: AutoencoderKL, seed: int, init_image: PIL.Image.Image
# ) -> torch.Tensor:
#     """
#     Encode the latents for the given image.
#     """
#     generator = torch.Generator().manual_seed(seed)

#     vae_scale_factor = 2 ** (len(vae.config.block_out_channels) - 1)  # type: ignore
#     image_processor = VaeImageProcessor(vae_scale_factor=vae_scale_factor)

#     image = image_processor.preprocess(init_image)
#     init_latents = vae.encode(torch.FloatTensor(image)).latent_dist.sample(generator)
#     init_latents = vae.config.scaling_factor * init_latents  # type: ignore
#     return init_latents


# def decode_latents(vae: AutoencoderKL, latents: torch.Tensor) -> PIL.Image.Image:
#     """
#     Decode the latents to an image.
#     """
#     latents = latents.to(torch.float32).to("cpu").unsqueeze(0)
#     image_tensor = vae.decode(latents / vae.config.scaling_factor, return_dict=False)[0]  # type: ignore
#     vae_scale_factor = 2 ** (len(vae.config.block_out_channels) - 1)  # type: ignore
#     image_processor = VaeImageProcessor(vae_scale_factor=vae_scale_factor)

#     image = image_processor.postprocess(
#         torch.FloatTensor(image_tensor.detach()),  # type: ignore
#         output_type="pil",
#         do_denormalize=[True],
#     )
#     image = image[0]  # type: ignore
#     assert isinstance(image, PIL.Image.Image)
#     return image
