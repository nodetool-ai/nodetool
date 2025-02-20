import asyncio
import os
import tempfile
from nodetool.dsl.graph import graph, run_graph
from nodetool.dsl.nodetool.constant import Image
from nodetool.metadata.types import (
    FolderPath,
    ImageRef,
    HFRealESRGAN,
)
from nodetool.dsl.huggingface.image_to_image import RealESRGANNode
from nodetool.dsl.nodetool.os import SaveImageFile

dirname = os.path.dirname(__file__)
image_path = os.path.join(dirname, "..", "tests", "test.jpg")
temp_dir = tempfile.mkdtemp()

g = SaveImageFile(
    image=RealESRGANNode(
        image=RealESRGANNode(  # First upscaling
            image=Image(value=ImageRef(uri=image_path, type="image")),
            model=HFRealESRGAN(
                repo_id="ai-forever/Real-ESRGAN",
                path="RealESRGAN_x2.pth",
            ),
        ),
        model=HFRealESRGAN(  # Second upscaling
            repo_id="ai-forever/Real-ESRGAN",
            path="RealESRGAN_x2.pth",
        ),
    ),
    folder=FolderPath(path=dirname),
    filename="upscaled_image_4x.jpg",
)

asyncio.run(run_graph(graph(g)))
