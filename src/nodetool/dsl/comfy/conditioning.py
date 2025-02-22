from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class CLIPSetLastLayer(GraphNode):
    """
    The CLIP Set Last Layer node can be used to set the CLIP output layer from which to take the text embeddings. Encoding text into an embedding happens by the text being transformed by various layers in the CLIP model. Although traditionally diffusion models are conditioned on the output of the last layer in CLIP, some diffusion models have been conditioned on earlier layers and might not work as well when using the output of the last layer.
    """

    clip: CLIP | GraphNode | tuple[GraphNode, str] = Field(default=CLIP(type='comfy.clip', name='', model=None), description='The CLIP model to modify.')
    stop_at_clip_layer: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The index of the last CLIP layer to use.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.CLIPSetLastLayer"



class CLIPTextEncode(GraphNode):
    """
    The CLIP Text Encode node can be used to encode a text prompt using a CLIP model into an embedding that can be used to guide the diffusion model towards generating specific images.
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to use.')
    clip: CLIP | GraphNode | tuple[GraphNode, str] = Field(default=CLIP(type='comfy.clip', name='', model=None), description='The CLIP model to use.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.CLIPTextEncode"



class CLIPVisionEncode(GraphNode):
    """
    The CLIP Vision Encode node can be used to encode an image using a CLIP vision model into an embedding that can be used to guide unCLIP diffusion models or as input to style models.
    """

    clip_vision: CLIPVision | GraphNode | tuple[GraphNode, str] = Field(default=CLIPVision(type='comfy.clip_vision', name='', model=None), description='The CLIP vision model to use for encoding.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to encode with the CLIP vision model.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.CLIPVisionEncode"



class ConditioningAverage(GraphNode):
    """
    The Conditioning (Average) node can be used to interpolate between two text embeddings according to a strength factor set in conditioning_to_strength.
    """

    conditioning_to: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The target conditioning.')
    conditioning_from: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The source conditioning.')
    conditioning_to_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the target conditioning.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ConditioningAverage"



class ConditioningCombine(GraphNode):
    """
    The Conditioning (Combine) node can be used to combine multiple conditionings by averaging the predicted noise of the diffusion model. Note that this is different from the Conditioning (Average) node. Here outputs of the diffusion model conditioned on different conditionings (i.e. all parts that make up the conditioning) are averaged out, while the Conditioning (Average) node interpolates the text embeddings that are stored inside the conditioning.
    """

    conditioning_1: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The first conditioning input.')
    conditioning_2: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The second conditioning input.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ConditioningCombine"



class ConditioningConcat(GraphNode):
    """
    The Conditioning (Concat) node can be used to concatenate two conditionings. This allows for combining different conditioning inputs sequentially, which can be useful for creating more complex guidance for the diffusion model.
    """

    conditioning_to: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The conditioning to concatenate to.')
    conditioning_from: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The conditioning to concatenate from.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ConditioningConcat"



class ConditioningSetArea(GraphNode):
    """
    The Conditioning (Set Area) node can be used to limit a conditioning to a specified area of the image. Together with the Conditioning (Combine) node this can be used to add more control over the composition of the final image.
    """

    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The conditioning to modify.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=64, description='The width of the area.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=64, description='The height of the area.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x-coordinate of the top-left corner of the area.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y-coordinate of the top-left corner of the area.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the conditioning in the set area.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ConditioningSetArea"



class ConditioningSetAreaPercentage(GraphNode):
    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The conditioning to modify.')
    width: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The width of the area as a percentage of the total width.')
    height: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The height of the area as a percentage of the total height.')
    x: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The x-coordinate of the top-left corner of the area as a percentage.')
    y: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The y-coordinate of the top-left corner of the area as a percentage.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the conditioning in the set area.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ConditioningSetAreaPercentage"


import nodetool.nodes.comfy.conditioning

class ConditioningSetMask(GraphNode):
    """
    The Conditioning (Set Mask) node can be used to limit a conditioning to a specified mask. Together with the Conditioning (Combine) node this can be used to add more control over the composition of the final image.
    """

    SetConditioningAreaEnum: typing.ClassVar[type] = nodetool.nodes.comfy.conditioning.ConditioningSetMask.SetConditioningAreaEnum
    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The conditioning to modify.')
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The mask to use for setting the conditioning.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the conditioning within the mask.')
    set_cond_area: nodetool.nodes.comfy.conditioning.ConditioningSetMask.SetConditioningAreaEnum = Field(default=SetConditioningAreaEnum.DEFAULT, description='Method to determine the area for setting conditioning.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ConditioningSetMask"



class ConditioningSetTimestepRange(GraphNode):
    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The conditioning to set timestep range.')
    start: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The start of the timestep range.')
    end: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The end of the timestep range.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ConditioningSetTimestepRange"



class ConditioningZeroOut(GraphNode):
    """
    The Conditioning (Zero Out) node can be used to zero out a conditioning. This effectively removes the influence of the conditioning on the diffusion process, which can be useful for creating areas of the image that are not influenced by the prompt or other conditioning inputs.
    """

    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The conditioning to be zeroed out.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ConditioningZeroOut"



class ControlNetApply(GraphNode):
    """
    The Apply ControlNet node can be used to provide further visual guidance to a diffusion model. Unlike unCLIP embeddings, controlnets and T2I adaptors work on any model. By chaining together multiple nodes it is possible to guide the diffusion model using multiple controlNets or T2I adaptors. This can be useful to e.g. hint at the diffusion model where the edges in the final image should be by providing an image containing edge detections along with a controlNet trained on edge detection images to this node.
    """

    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The conditioning to apply.')
    control_net: ControlNet | GraphNode | tuple[GraphNode, str] = Field(default=ControlNet(type='comfy.control_net', name='', model=None), description='The control net to apply.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default='', description='The image to apply to.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the controlnet.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ControlNetApply"



class ControlNetApplyAdvanced(GraphNode):
    """
    The Apply ControlNet (Advanced) node provides more fine-grained control over the application of a ControlNet to the diffusion process. It allows for separate positive and negative conditioning, as well as control over the strength and range of application of the ControlNet.
    """

    positive: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The positive conditioning to apply.')
    negative: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The negative conditioning to apply.')
    control_net: ControlNet | GraphNode | tuple[GraphNode, str] = Field(default=ControlNet(type='comfy.control_net', name='', model=None), description='The ControlNet to use.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to apply conditioning adjustments to.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of conditioning.')
    start_percent: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The start percentage from which to apply conditioning.')
    end_percent: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The end percentage until which to apply conditioning.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.ControlNetApplyAdvanced"



class GLIGENTextBoxApply(GraphNode):
    """
    The GLIGEN Textbox Apply node can be used to provide further spatial guidance to a diffusion model, guiding it to generate the specified parts of the prompt in a specific region of the image. Although the text input will accept any text, GLIGEN works best if the input to it is an object that is part of the text prompt.
    """

    conditioning_to: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The input conditioning to modify.')
    clip: CLIP | GraphNode | tuple[GraphNode, str] = Field(default=CLIP(type='comfy.clip', name='', model=None), description='The CLIP instance to use.')
    gligen_textbox_model: GLIGEN | GraphNode | tuple[GraphNode, str] = Field(default=GLIGEN(type='comfy.gligen', name='', model=None), description='The GLIGEN textbox model to apply.')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to apply.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=64, description='The width of the text box.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=64, description='The height of the text box.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x position of the text box.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y position of the text box.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.GLIGENTextBoxApply"



class InpaintModelConditioning(GraphNode):
    """
    The Inpaint Model Conditioning node prepares conditioning for inpainting models by combining the input image, mask, and conditioning information.
    """

    positive: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The positive conditioning to apply.')
    negative: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The negative conditioning to apply.')
    vae: VAE | GraphNode | tuple[GraphNode, str] = Field(default=VAE(type='comfy.vae', name='', model=None), description='The VAE model to use.')
    pixels: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The input image to inpaint.')
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The mask indicating areas to inpaint.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.InpaintModelConditioning"



class LTXVConditioning(GraphNode):
    """
    Sets frame rate in the conditioning for LTXV video models.
    conditioning, ltxv, frame rate

    Use cases:
    - Specify frame rate for video models
    - Adjust temporal aspects of video generation
    - Prepare conditioning for LTXV models
    """

    positive: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='Positive conditioning.')
    negative: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='Negative conditioning.')
    frame_rate: float | GraphNode | tuple[GraphNode, str] = Field(default=25.0, description='Frame rate for video generation.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.LTXVConditioning"



class LTXVImgToVideo(GraphNode):
    """
    Converts an input image to a video latent, applying conditioning.
    image, video, latent, ltxv

    Use cases:
    - Initialize video generation from an image
    - Prepare conditioning for LTXV video models
    - Transition from image to video in latent space
    """

    positive: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='Positive conditioning.')
    negative: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='Negative conditioning.')
    vae: VAE | GraphNode | tuple[GraphNode, str] = Field(default=VAE(type='comfy.vae', name='', model=None), description='VAE model to use.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Input image.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description='Width of the output video.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Height of the output video.')
    length: int | GraphNode | tuple[GraphNode, str] = Field(default=97, description='Length (frames) of the video.')
    batch_size: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Batch size.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.LTXVImgToVideo"



class SVD_img2vid_Conditioning(GraphNode):
    """
    The SVD Image to Video Conditioning node prepares conditioning for transforming a single image into a video sequence. It utilizes CLIP vision encoding and VAE processing to create appropriate conditioning for video generation models.
    """

    clip_vision: CLIPVision | GraphNode | tuple[GraphNode, str] = Field(default=CLIPVision(type='comfy.clip_vision', name='', model=None), description='The CLIP vision model to use.')
    init_image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The initial image to condition on.')
    vae: VAE | GraphNode | tuple[GraphNode, str] = Field(default=VAE(type='comfy.vae', name='', model=None), description='The VAE model to use.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='The width of the output.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=576, description='The height of the output.')
    video_frames: int | GraphNode | tuple[GraphNode, str] = Field(default=14, description='The number of video frames to generate.')
    motion_bucket_id: int | GraphNode | tuple[GraphNode, str] = Field(default=127, description='The motion bucket ID.')
    fps: int | GraphNode | tuple[GraphNode, str] = Field(default=6, description='Frames per second.')
    augmentation_level: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The level of augmentation to apply.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.SVD_img2vid_Conditioning"



class StyleModelApply(GraphNode):
    """
    The Style Model Apply node applies a style model to the conditioning using CLIP vision output,
    allowing for style transfer effects in the generation process.
    """

    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The conditioning to modify.')
    style_model: StyleModel | GraphNode | tuple[GraphNode, str] = Field(default=StyleModel(type='comfy.style_model', name='', model=None), description='The style model to apply.')
    clip_vision_output: CLIPVisionOutput | GraphNode | tuple[GraphNode, str] = Field(default=CLIPVisionOutput(type='comfy.clip_vision_output', data=None), description='The CLIP vision output to use for styling.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.StyleModelApply"



class unCLIPConditioning(GraphNode):
    """
    The unCLIP Conditioning node can be used to incorporate CLIP vision output into the conditioning process. This allows for image-guided generation, where the content and style of an input image can influence the output of the diffusion model.
    """

    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The conditioning to modify.')
    clip_vision_output: CLIPVisionOutput | GraphNode | tuple[GraphNode, str] = Field(default=CLIPVisionOutput(type='comfy.clip_vision_output', data=None), description='The CLIP vision output to associate.')
    strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The strength of the association with the CLIP vision output.')
    noise_augmentation: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The amount of noise augmentation to apply.')

    @classmethod
    def get_node_type(cls): return "comfy.conditioning.unCLIPConditioning"


