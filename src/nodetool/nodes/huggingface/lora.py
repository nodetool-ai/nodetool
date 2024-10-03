from nodetool.metadata.types import (
    HFLoraSDConfig,
    HFLoraSD,
    HFLoraSDXL,
    HFLoraSDXLConfig,
)
from nodetool.workflows.base_node import BaseNode
from pydantic import Field

from nodetool.workflows.processing_context import ProcessingContext


HF_LORA_SD_MODELS = [
    HFLoraSD(repo_id="danbrown/loras", path="2d_sprite.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="ghibli_scenery.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="add_detail.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="colorwater.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="sxz_game_assets.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="3Danaglyph.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="akiratoriyama_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="animeoutlineV4.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="aqua_konosuba.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="arakihirohiko_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="arcane_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="canetaazul.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="cyberpunk_tarot.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="discoelysium_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="esdeath_akamegakill.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="fire_vfx.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="flamingeye.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="funnycreatures.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="gacha_splash.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="gigachad.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="gyokai_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="harold.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="hiderohoribes_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="ilyakuvshinov_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="jacksparrow.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="jimlee_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="komowataharuka_chibiart.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="lightning_vfx.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="lucy_cyberpunk.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="luisap_pixelart.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="mumei_kabaneri.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="myheroacademia_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="neoartcore.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="ochakouraraka.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="onepiece_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="paimon_genshinimpact.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="peanutscomics_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="pepefrog.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="persona5_portraits.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="persona5_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="pixhell.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="princesszelda.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="satoshiuruchihara_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="shinobu_demonslayer.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="sokolov_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="standingbackgroundv1.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="sun_shadow_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="thickeranimelines.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="threesidedview.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="twitch_emotes.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="water_vfx.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="wlop_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="zerotwo_darling.safetensors"),
]


HF_LORA_SDXL_MODELS = [
    HFLoraSDXL(repo_id="CiroN2022/toy-face", path="toy_face_sdxl.safetensors"),
    HFLoraSDXL(repo_id="nerijs/pixel-art-xl", path="pixel-art-xl.safetensors"),
    HFLoraSDXL(
        repo_id="goofyai/3d_render_style_xl", path="3d_render_style_xl.safetensors"
    ),
    HFLoraSDXL(
        repo_id="artificialguybr/CuteCartoonRedmond-V2",
        path="CuteCartoonRedmond-CuteCartoon-CuteCartoonAF.safetensors",
    ),
    HFLoraSDXL(
        repo_id="blink7630/graphic-novel-illustration",
        path="Graphic_Novel_Illustration-000007.safetensors",
    ),
    HFLoraSDXL(
        repo_id="robert123231/coloringbookgenerator",
        path="ColoringBookRedmond-ColoringBook-ColoringBookAF.safetensors",
    ),
    HFLoraSDXL(
        repo_id="Linaqruf/anime-detailer-xl-lora",
        path="anime-detailer-xl-lora.safetensors",
    ),
]


class LoRASelector(BaseNode):
    """
    Selects up to 5 LoRA models to apply to a Stable Diffusion model.
    lora, model customization, fine-tuning

    Use cases:
    - Combining multiple LoRA models for unique image styles
    - Fine-tuning Stable Diffusion models with specific attributes
    - Experimenting with different LoRA combinations
    """

    lora1: HFLoraSD = Field(default=HFLoraSD(), description="First LoRA model")
    strength1: float = Field(
        default=1.0, ge=0.0, le=2.0, description="Strength for first LoRA"
    )

    lora2: HFLoraSD = Field(default=HFLoraSD(), description="Second LoRA model")
    strength2: float = Field(
        default=1.0, ge=0.0, le=2.0, description="Strength for second LoRA"
    )

    lora3: HFLoraSD = Field(default=HFLoraSD(), description="Third LoRA model")
    strength3: float = Field(
        default=1.0, ge=0.0, le=2.0, description="Strength for third LoRA"
    )

    lora4: HFLoraSD = Field(default=HFLoraSD(), description="Fourth LoRA model")
    strength4: float = Field(
        default=1.0, ge=0.0, le=2.0, description="Strength for fourth LoRA"
    )

    lora5: HFLoraSD = Field(default=HFLoraSD(), description="Fifth LoRA model")
    strength5: float = Field(
        default=1.0, ge=0.0, le=2.0, description="Strength for fifth LoRA"
    )

    @classmethod
    def get_title(cls) -> str:
        return "LoRA Selector"

    @classmethod
    def get_recommended_models(cls) -> list[HFLoraSD]:
        return HF_LORA_SD_MODELS

    async def process(self, context: ProcessingContext) -> list[HFLoraSDConfig]:
        loras = []
        for i in range(1, 6):
            lora = getattr(self, f"lora{i}")
            strength = getattr(self, f"strength{i}")
            if lora.is_set():
                loras.append(HFLoraSDConfig(lora=lora, strength=strength))
        return loras


class LoRASelectorXL(LoRASelector):
    """
    Selects up to 5 LoRA models to apply to a Stable Diffusion XL model.
    lora, model customization, fine-tuning

    Use cases:
    - Combining multiple LoRA models for unique image styles
    - Fine-tuning Stable Diffusion XL models with specific attributes
    - Experimenting with different LoRA combinations
    """

    lora1: HFLoraSDXL = Field(default=HFLoraSDXL(), description="First LoRA model")
    strength1: float = Field(
        default=1.0, ge=0.0, le=2.0, description="Strength for first LoRA"
    )

    lora2: HFLoraSDXL = Field(default=HFLoraSDXL(), description="Second LoRA model")
    strength2: float = Field(
        default=1.0, ge=0.0, le=2.0, description="Strength for second LoRA"
    )

    lora3: HFLoraSDXL = Field(default=HFLoraSDXL(), description="Third LoRA model")
    strength3: float = Field(
        default=1.0, ge=0.0, le=2.0, description="Strength for third LoRA"
    )

    lora4: HFLoraSDXL = Field(default=HFLoraSDXL(), description="Fourth LoRA model")
    strength4: float = Field(
        default=1.0, ge=0.0, le=2.0, description="Strength for fourth LoRA"
    )

    lora5: HFLoraSDXL = Field(default=HFLoraSDXL(), description="Fifth LoRA model")
    strength5: float = Field(
        default=1.0, ge=0.0, le=2.0, description="Strength for fifth LoRA"
    )

    @classmethod
    def get_title(cls) -> str:
        return "LoRA XL Selector"

    @classmethod
    def get_recommended_models(cls) -> list[HFLoraSDXL]:
        return HF_LORA_SDXL_MODELS

    async def process(self, context: ProcessingContext) -> list[HFLoraSDXLConfig]:
        loras = []
        for i in range(1, 6):
            lora = getattr(self, f"lora{i}")
            strength = getattr(self, f"strength{i}")
            if lora.is_set():
                loras.append(HFLoraSDXLConfig(lora=lora, strength=strength))
        return loras
