import asyncio
import os
from nodetool.dsl.graph import graph, run_graph
from nodetool.dsl.huggingface.text_to_image import StableDiffusion
from nodetool.dsl.huggingface.automatic_speech_recognition import Whisper
from nodetool.dsl.nodetool.constant import Audio
from nodetool.metadata.types import (
    AudioRef,
    HFAutomaticSpeechRecognition,
    HFStableDiffusion,
)
from nodetool.nodes.huggingface.stable_diffusion_base import StableDiffusionScheduler

dirname = os.path.dirname(__file__)
audio_path = os.path.join(dirname, "..", "tests", "test.mp3")

g = StableDiffusion(
    prompt=(
        Whisper(
            audio=Audio(value=AudioRef(uri=audio_path, type="audio")),
            model=HFAutomaticSpeechRecognition(
                repo_id="openai/whisper-small",
            ),
        ),
        "text",
    ),
    model=HFStableDiffusion(
        repo_id="SG161222/Realistic_Vision_V5.1_noVAE",
        path="Realistic_Vision_V5.1_fp16-no-ema.safetensors",
    ),
)

asyncio.run(run_graph(graph(g)))
