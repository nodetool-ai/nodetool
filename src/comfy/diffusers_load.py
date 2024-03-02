# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
#
# Copyright (c) @comfyanonymous
# Project Repository: https://github.com/comfyanonymous/ComfyUI

import json
import os

import comfy.sd

def first_file(path, filenames):
    for f in filenames:
        p = os.path.join(path, f)
        if os.path.exists(p):
            return p
    return None

def load_diffusers(model_path, output_vae=True, output_clip=True, embedding_directory=None):
    diffusion_model_names = ["diffusion_pytorch_model.fp16.safetensors", "diffusion_pytorch_model.safetensors", "diffusion_pytorch_model.fp16.bin", "diffusion_pytorch_model.bin"]
    unet_path = first_file(os.path.join(model_path, "unet"), diffusion_model_names)
    vae_path = first_file(os.path.join(model_path, "vae"), diffusion_model_names)

    text_encoder_model_names = ["model.fp16.safetensors", "model.safetensors", "pytorch_model.fp16.bin", "pytorch_model.bin"]
    text_encoder1_path = first_file(os.path.join(model_path, "text_encoder"), text_encoder_model_names)
    text_encoder2_path = first_file(os.path.join(model_path, "text_encoder_2"), text_encoder_model_names)

    text_encoder_paths = [text_encoder1_path]
    if text_encoder2_path is not None:
        text_encoder_paths.append(text_encoder2_path)

    unet = comfy.sd.load_unet(unet_path)

    clip = None
    if output_clip:
        clip = comfy.sd.load_clip(text_encoder_paths, embedding_directory=embedding_directory)

    vae = None
    if output_vae:
        sd = comfy.utils.load_torch_file(vae_path)
        vae = comfy.sd.VAE(sd=sd)

    return (unet, clip, vae)
