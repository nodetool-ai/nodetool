from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class CLIPVisionLoader(GraphNode):
    clip_name: CLIPVisionFile | GraphNode | tuple[GraphNode, str] = Field(default=CLIPVisionFile(type='comfy.clip_vision_file', name=''), description='The name of the CLIP vision model to load.')
    @classmethod
    def get_node_type(cls): return "comfy.loaders.CLIPVisionLoader"



class CheckpointLoader(GraphNode):
    ckpt_name: CheckpointFile | GraphNode | tuple[GraphNode, str] = Field(default=CheckpointFile(type='comfy.checkpoint_file', name=''), description='The checkpoint to load.')
    @classmethod
    def get_node_type(cls): return "comfy.loaders.CheckpointLoader"



class CheckpointLoaderSimple(GraphNode):
    ckpt_name: CheckpointFile | GraphNode | tuple[GraphNode, str] = Field(default=CheckpointFile(type='comfy.checkpoint_file', name=''), description='The checkpoint to load.')
    @classmethod
    def get_node_type(cls): return "comfy.loaders.CheckpointLoaderSimple"



class ControlNetLoader(GraphNode):
    control_net_name: ControlNetFile | GraphNode | tuple[GraphNode, str] = Field(default=ControlNetFile(type='comfy.control_net_file', name=''), description='The filename of the control net to load.')
    @classmethod
    def get_node_type(cls): return "comfy.loaders.ControlNetLoader"



class GLIGENLoader(GraphNode):
    gligen_name: GLIGENFile | GraphNode | tuple[GraphNode, str] = Field(default=GLIGENFile(type='comfy.gligen_file', name=''), description='The GLIGEN checkpoint to load.')
    @classmethod
    def get_node_type(cls): return "comfy.loaders.GLIGENLoader"



class UpscaleModelLoader(GraphNode):
    model_name: UpscaleModelFile | GraphNode | tuple[GraphNode, str] = Field(default=UpscaleModelFile(type='comfy.upscale_model_file', name=''), description='The filename of the upscale model to load.')
    @classmethod
    def get_node_type(cls): return "comfy.loaders.UpscaleModelLoader"



class unCLIPCheckpointLoader(GraphNode):
    ckpt_name: unCLIPFile | GraphNode | tuple[GraphNode, str] = Field(default=unCLIPFile(type='comfy.unclip_file', name=''), description='The checkpoint to load.')
    @classmethod
    def get_node_type(cls): return "comfy.loaders.unCLIPCheckpointLoader"


