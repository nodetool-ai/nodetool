from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class LoRASelector(GraphNode):
    """
    Selects up to 5 LoRA models to apply to a Stable Diffusion model.
    lora, model customization, fine-tuning, SD

    Use cases:
    - Combining multiple LoRA models for unique image styles
    - Fine-tuning Stable Diffusion models with specific attributes
    - Experimenting with different LoRA combinations
    """

    lora1: HFLoraSD | GraphNode | tuple[GraphNode, str] = Field(default=HFLoraSD(type='hf.lora_sd', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='First LoRA model')
    strength1: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength for first LoRA')
    lora2: HFLoraSD | GraphNode | tuple[GraphNode, str] = Field(default=HFLoraSD(type='hf.lora_sd', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='Second LoRA model')
    strength2: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength for second LoRA')
    lora3: HFLoraSD | GraphNode | tuple[GraphNode, str] = Field(default=HFLoraSD(type='hf.lora_sd', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='Third LoRA model')
    strength3: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength for third LoRA')
    lora4: HFLoraSD | GraphNode | tuple[GraphNode, str] = Field(default=HFLoraSD(type='hf.lora_sd', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='Fourth LoRA model')
    strength4: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength for fourth LoRA')
    lora5: HFLoraSD | GraphNode | tuple[GraphNode, str] = Field(default=HFLoraSD(type='hf.lora_sd', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='Fifth LoRA model')
    strength5: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength for fifth LoRA')

    @classmethod
    def get_node_type(cls): return "huggingface.lora.LoRASelector"



class LoRASelectorXL(GraphNode):
    """
    Selects up to 5 LoRA models to apply to a Stable Diffusion XL model.
    lora, model customization, fine-tuning, SDXL

    Use cases:
    - Combining multiple LoRA models for unique image styles
    - Fine-tuning Stable Diffusion XL models with specific attributes
    - Experimenting with different LoRA combinations
    """

    lora1: HFLoraSDXL | GraphNode | tuple[GraphNode, str] = Field(default=HFLoraSDXL(type='hf.lora_sdxl', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='First LoRA model')
    strength1: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength for first LoRA')
    lora2: HFLoraSDXL | GraphNode | tuple[GraphNode, str] = Field(default=HFLoraSDXL(type='hf.lora_sdxl', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='Second LoRA model')
    strength2: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength for second LoRA')
    lora3: HFLoraSDXL | GraphNode | tuple[GraphNode, str] = Field(default=HFLoraSDXL(type='hf.lora_sdxl', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='Third LoRA model')
    strength3: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength for third LoRA')
    lora4: HFLoraSDXL | GraphNode | tuple[GraphNode, str] = Field(default=HFLoraSDXL(type='hf.lora_sdxl', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='Fourth LoRA model')
    strength4: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength for fourth LoRA')
    lora5: HFLoraSDXL | GraphNode | tuple[GraphNode, str] = Field(default=HFLoraSDXL(type='hf.lora_sdxl', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='Fifth LoRA model')
    strength5: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength for fifth LoRA')

    @classmethod
    def get_node_type(cls): return "huggingface.lora.LoRASelectorXL"


