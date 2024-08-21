from nodetool.common.comfy_node import ComfyNode
from nodetool.metadata.types import (
    ControlNet,
    ImageRef,
    Mask,
    UNet,
    Conditioning,
    InstantID,
    InstantIDFile,
    FaceAnalysis,
    FaceEmbeds,
)
from pydantic import Field

from nodetool.workflows.processing_context import ProcessingContext


class InstantIDModelLoader(ComfyNode):
    """
    The InstantID Model Loader node loads an InstantID model file for use in face-aware image generation and editing tasks.
    """

    instantid_file: InstantIDFile = Field(
        default=InstantIDFile(), description="The InstantID model file to load."
    )

    @classmethod
    def return_type(cls):
        return {"instantid": InstantID}

    async def process(self, context: ProcessingContext):
        model = (await self.call_comfy_node(context))[0]

        context.add_model(InstantID().type, self.instantid_file.name, model)

        return {"instantid": InstantID(name=self.instantid_file.name)}


class InstantIDFaceAnalysis(ComfyNode):
    """
    The InstantID Face Analysis node initializes a face analysis model, which is used to detect and analyze facial features in images.
    """

    provider: str = Field(default="CPU", description="The provider for face analysis.")

    @classmethod
    def return_type(cls):
        return {"faceanalysis": FaceAnalysis}


class FaceKeypointsPreprocessor(ComfyNode):
    """
    The Face Keypoints Preprocessor node prepares an input image by detecting and extracting facial keypoints, which are crucial for face-aware image processing tasks.
    """

    faceanalysis: FaceAnalysis = Field(
        default=FaceAnalysis(), description="The face analysis model."
    )
    image: ImageRef = Field(default=ImageRef(), description="The input image.")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ApplyInstantID(ComfyNode):
    """
    The Apply InstantID node integrates InstantID face-aware processing into the image generation pipeline, allowing for more precise control over facial features in generated images.
    """

    instantid: InstantID = Field(
        default=InstantID(), description="The InstantID model."
    )
    insightface: FaceAnalysis = Field(
        default=FaceAnalysis(), description="The face analysis model."
    )
    control_net: ControlNet = Field(
        default=ControlNet(), description="The ControlNet model."
    )
    image: ImageRef = Field(default=ImageRef(), description="The input image.")
    model: UNet = Field(default=UNet(), description="The UNet model.")
    positive: Conditioning = Field(
        default=Conditioning(), description="The positive conditioning."
    )
    negative: Conditioning = Field(
        default=Conditioning(), description="The negative conditioning."
    )
    weight: float = Field(
        default=0.8, description="The weight for InstantID application."
    )
    start_at: float = Field(
        default=0.0, description="The start point for InstantID application."
    )
    end_at: float = Field(
        default=1.0, description="The end point for InstantID application."
    )
    image_kps: ImageRef | None = Field(default=None, description="The image keypoints.")
    mask: Mask | None = Field(
        default=None, description="The mask for InstantID application."
    )

    @classmethod
    def return_type(cls):
        return {"model": UNet, "positive": Conditioning, "negative": Conditioning}

    async def process(self, context: ProcessingContext):
        model, positive, negative = await self.call_comfy_node(context)
        name = self.model.name + "_instantid"

        context.add_model(UNet().type, name, model)

        return {
            "model": UNet(name=name),
            "positive": Conditioning(data=positive),
            "negative": Conditioning(data=negative),
        }


class ApplyInstantIDAdvanced(ComfyNode):
    """
    The Apply InstantID Advanced node provides more fine-grained control over the InstantID face-aware processing, allowing for separate control of IP weight and ControlNet strength.
    """

    instantid: InstantID = Field(
        default=InstantID(), description="The InstantID model."
    )
    insightface: FaceAnalysis = Field(
        default=FaceAnalysis(), description="The face analysis model."
    )
    control_net: ControlNet = Field(
        default=ControlNet(), description="The ControlNet model."
    )
    image: ImageRef = Field(default=ImageRef(), description="The input image.")
    model: UNet = Field(default=UNet(), description="The UNet model.")
    positive: Conditioning = Field(
        default=Conditioning(), description="The positive conditioning."
    )
    negative: Conditioning = Field(
        default=Conditioning(), description="The negative conditioning."
    )
    ip_weight: float = Field(
        default=0.8, description="The weight for InstantID application."
    )
    cn_strength: float = Field(
        default=0.8, description="The strength of the ControlNet."
    )
    start_at: float = Field(
        default=0.0, description="The start point for InstantID application."
    )
    end_at: float = Field(
        default=1.0, description="The end point for InstantID application."
    )
    noise: float = Field(
        default=0.0, description="The noise level for InstantID application."
    )
    image_kps: ImageRef | None = Field(default=None, description="The image keypoints.")
    mask: Mask | None = Field(
        default=None, description="The mask for InstantID application."
    )

    @classmethod
    def return_type(cls):
        return {"model": UNet, "positive": Conditioning, "negative": Conditioning}

    async def process(self, context: ProcessingContext):
        model, positive, negative = await self.call_comfy_node(context)
        name = self.model.name + "_instantid"

        context.add_model(UNet().type, name, model)

        return {
            "model": UNet(name=name),
            "positive": Conditioning(data=positive),
            "negative": Conditioning(data=negative),
        }


class InstantIDAttentionPatch(ComfyNode):
    """
    The InstantID Attention Patch node applies an attention patching mechanism to the UNet model, enhancing its focus on facial features during the generation process.
    """

    instantid: InstantID = Field(
        default=InstantID(), description="The InstantID model."
    )
    insightface: FaceAnalysis = Field(
        default=FaceAnalysis(), description="The face analysis model."
    )
    image: ImageRef = Field(default=ImageRef(), description="The input image.")
    model: UNet = Field(default=UNet(), description="The UNet model.")
    weight: float = Field(default=1.0, description="The weight for attention patching.")
    start_at: float = Field(
        default=0.0, description="The start point for attention patching."
    )
    end_at: float = Field(
        default=1.0, description="The end point for attention patching."
    )
    noise: float = Field(
        default=0.0, description="The noise level for attention patching."
    )
    mask: Mask | None = Field(
        default=None, description="The mask for attention patching."
    )

    @classmethod
    def return_type(cls):
        return {"model": UNet, "face_embeds": FaceEmbeds}

    async def process(self, context: ProcessingContext):
        model, face_embeds = await self.call_comfy_node(context)
        name = self.model.name + "_instantid"

        context.add_model(UNet().type, name, model)

        return {
            "model": UNet(name=name),
            "face_embeds": FaceEmbeds(data=face_embeds),
        }


class ApplyInstantIDControlNet(ComfyNode):
    """
    The Apply InstantID ControlNet node integrates face embeddings and keypoints with a ControlNet model, allowing for precise control over facial features in the generated images.
    """

    face_embeds: FaceEmbeds = Field(
        default=FaceEmbeds(), description="The face embeddings."
    )
    control_net: ControlNet = Field(
        default=ControlNet(), description="The ControlNet model."
    )
    image_kps: ImageRef = Field(default=ImageRef(), description="The image keypoints.")
    positive: Conditioning = Field(
        default=Conditioning(), description="The positive conditioning."
    )
    negative: Conditioning = Field(
        default=Conditioning(), description="The negative conditioning."
    )
    strength: float = Field(
        default=1.0, description="The strength of the ControlNet application."
    )
    start_at: float = Field(
        default=0.0, description="The start point for ControlNet application."
    )
    end_at: float = Field(
        default=1.0, description="The end point for ControlNet application."
    )
    mask: Mask | None = Field(
        default=None, description="The mask for ControlNet application."
    )

    @classmethod
    def return_type(cls):
        return {"positive": Conditioning, "negative": Conditioning}
