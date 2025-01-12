from enum import Enum
from pydantic import Field
from nodetool.metadata.types import ImageRef
from nodetool.nodes.fal.fal_node import FALNode
from nodetool.workflows.processing_context import ProcessingContext



class FluxV1Pro(FALNode):
    """
    FLUX1.1 [pro] is an enhanced version of FLUX.1 [pro], improved image generation capabilities, delivering superior composition, detail, and artistic fidelity compared to its predecessor.
    fal, text, image
    """

    prompt: str = Field(default="", description="The prompt to generate an image from")

    async def process(self, context: ProcessingContext) -> ImageRef:
        res = await self.submit_request(
            context=context,
            application="fal-ai/flux-pro/v1.1",
            arguments={"prompt": self.prompt},
        )
        assert res["images"] is not None
        assert len(res["images"]) > 0
        return ImageRef(uri=res["images"][0]["url"])


class FluxV1ProUltra(FALNode):
    """
    FLUX1.1 [ultra] is the latest and most advanced version of FLUX.1 [pro], 
    featuring cutting-edge improvements in image generation, delivering unparalleled 
    composition, detail, and artistic fidelity.
    """

    prompt: str = Field(default="", description="The prompt to generate an image from")

    async def process(self, context: ProcessingContext) -> ImageRef:
        res = await self.submit_request(
            context=context,
            application="fal-ai/flux-pro/v1.1-ultra",
            arguments={"prompt": self.prompt},
        )
        assert res["images"] is not None
        assert len(res["images"]) > 0
        return ImageRef(uri=res["images"][0]["url"])
    

class ReduxV3(FALNode):
    """
    REDUX3 is a cutting-edge image generation model that combines advanced AI technology with 
    advanced image processing techniques to deliver stunning visual results.
    """

    prompt: str = Field(default="", description="The prompt to generate an image from")

    async def process(self, context: ProcessingContext) -> ImageRef:
        res = await self.submit_request(
            context=context,
            application="fal-ai/recraft-v3",
            arguments={"prompt": self.prompt},
        )
        assert res["images"] is not None
        assert len(res["images"]) > 0
        return ImageRef(uri=res["images"][0]["url"])
