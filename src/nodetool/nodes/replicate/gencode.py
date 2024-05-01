from nodetool.common.replicate_node import replicate_node
from nodetool.metadata.types import AudioRef, ImageRef, VideoRef

"""
This script generates source code for all replicate nodes 
using information from Replicate's model API.
"""

if __name__ == "__main__":
    replicate_node(
        node_name="AdInpaint",
        namespace="image.generate",
        model_id="logerzhu/ad-inpaint",
        return_type=ImageRef,
        overrides={
            "image_path": ImageRef,
        },
    )

    replicate_node(
        model_id="lucataco/proteus-v0.4",
        node_name="Proteus",
        namespace="image.generate",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
            "mask": ImageRef,
        },
    )

    replicate_node(
        node_name="SDXLClipInterrogator",
        namespace="image.analyze",
        model_id="lucataco/sdxl-clip-interrogator",
        return_type=str,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        model_id="lucataco/moondream2",
        namespace="image.analyze",
        node_name="Moondream2",
        return_type=str,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        model_id="abiruyt/text-extract-ocr",
        node_name="TextExtractOCR",
        namespace="image.ocr",
        return_type=str,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        model_id="mickeybeurskens/latex-ocr",
        node_name="LatexOCR",
        namespace="image.ocr",
        return_type=str,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        model_id="fofr/face-to-many",
        node_name="FaceToMany",
        namespace="image.face",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        node_name="BecomeImage",
        namespace="image.face",
        model_id="fofr/become-image",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
            "image_to_become": ImageRef,
        },
    )

    replicate_node(
        model_id="tencentarc/photomaker",
        node_name="PhotoMaker",
        namespace="image.face",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        model_id="tencentarc/photomaker-style",
        node_name="PhotoMakerStyle",
        namespace="image.face",
        return_type=ImageRef,
        overrides={
            "input_image": ImageRef,
            "input_image2": ImageRef,
            "input_image3": ImageRef,
            "input_image4": ImageRef,
        },
    )

    replicate_node(
        model_id="fofr/face-to-sticker",
        node_name="FaceToSticker",
        namespace="image.face",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        model_id="zsxkib/instant-id",
        node_name="InstantId",
        namespace="image.face",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
            "pose_image": ImageRef,
        },
    )

    replicate_node(
        node_name="RealEsrGan",
        namespace="image.upscale",
        model_id="nightmareai/real-esrgan",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        node_name="ClarityUpscaler",
        namespace="image.upscale",
        model_id="philz1337x/clarity-upscaler",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        node_name="MagicImageRefiner",
        namespace="image.upscale",
        model_id="batouresearch/magic-image-refiner",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
            "mask": ImageRef,
        },
    )

    replicate_node(
        node_name="ruDallE_SR",
        namespace="image.upscale",
        model_id="cjwbw/rudalle-sr",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        node_name="HighResolutionControlNetTile",
        namespace="image.upscale",
        model_id="batouresearch/high-resolution-controlnet-tile",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        node_name="UltimateSDUpscale",
        namespace="image.upscale",
        model_id="fewjative/ultimate-sd-upscale",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        node_name="Maxim",
        model_id="google-research/maxim",
        namespace="image.enhance",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        node_name="SwinIR",
        namespace="image.upscale",
        model_id="jingyunliang/swinir",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        node_name="Swin2SR",
        namespace="image.upscale",
        model_id="mv-lab/swin2sr",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )
    replicate_node(
        model_id="stability-ai/stable-diffusion",
        node_name="StableDiffusion",
        namespace="image.generate",
        return_type=ImageRef,
    )

    replicate_node(
        model_id="usamaehsan/controlnet-1.1-x-realistic-vision-v2.0",
        node_name="ControlnetRealisticVision",
        namespace="image.generate",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        model_id="stability-ai/sdxl",
        node_name="StableDiffusionXL",
        namespace="image.generate",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
            "mask": ImageRef,
        },
    )

    replicate_node(
        model_id="lucataco/juggernaut-xl-v9",
        node_name="Juggernaut_XL_V9",
        namespace="image.generate",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
            "mask": ImageRef,
        },
    )

    replicate_node(
        model_id="swartype/sdxl-pixar",
        node_name="SDXL_Pixar",
        namespace="image.generate",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
            "mask": ImageRef,
        },
    )

    replicate_node(
        model_id="fofr/sdxl-emoji",
        node_name="SDXL_Emoji",
        namespace="image.generate",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
            "mask": ImageRef,
        },
    )

    replicate_node(
        model_id="lucataco/sdxl-inpainting",
        node_name="StableDiffusionInpainting",
        namespace="image.generate",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        model_id="fofr/realvisxl-v3-multi-controlnet-lora",
        node_name="RealVisXLV3",
        namespace="image.generate",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
            "mask": ImageRef,
            "controlnet_1_image": ImageRef,
            "controlnet_2_image": ImageRef,
            "controlnet_3_image": ImageRef,
        },
    )

    replicate_node(
        model_id="lucataco/sdxl-controlnet",
        node_name="SDXL_Controlnet",
        namespace="image.generate",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        model_id="catacolabs/sdxl-ad-inpaint",
        node_name="SDXL_Ad_Inpaint",
        namespace="image.generate",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        node_name="OldPhotosRestoration",
        namespace="image.enhance",
        model_id="microsoft/bringing-old-photos-back-to-life",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        node_name="Kandinsky",
        namespace="image.generate",
        model_id="ai-forever/kandinsky-2.2",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        node_name="StableDiffusionXLLightning",
        namespace="image.generate",
        model_id="bytedance/sdxl-lightning-4step",
        return_type=ImageRef,
    )

    replicate_node(
        node_name="PlaygroundV2",
        namespace="image.generate",
        model_id="playgroundai/playground-v2.5-1024px-aesthetic",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        node_name="HotshotXL",
        namespace="video.generate",
        model_id="lucataco/hotshot-xl",
        return_type=VideoRef,
    )

    replicate_node(
        node_name="AnimateDiff",
        namespace="video.generate",
        model_id="zsxkib/animate-diff",
        return_type=VideoRef,
    )

    replicate_node(
        node_name="Zeroscope_V2_XL",
        namespace="video.generate",
        model_id="anotherjesse/zeroscope-v2-xl",
        return_type=VideoRef,
    )

    replicate_node(
        node_name="RobustVideoMatting",
        namespace="video.generate",
        model_id="arielreplicate/robust_video_matting",
        return_type=VideoRef,
        overrides={
            "input_video": VideoRef,
        },
    )

    replicate_node(
        node_name="StableDiffusionInfiniteZoom",
        namespace="video.generate",
        model_id="arielreplicate/stable_diffusion_infinite_zoom",
        return_type=VideoRef,
    )

    replicate_node(
        node_name="AnimateDiffIllusions",
        namespace="video.generate",
        model_id="zsxkib/animatediff-illusions",
        return_type=VideoRef,
        overrides={
            "controlnet_video": VideoRef,
        },
    )

    replicate_node(
        node_name="Illusions",
        namespace="image.generate",
        model_id="fofr/illusions",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
            "control_image": ImageRef,
            "mask_image": ImageRef,
        },
    )

    replicate_node(
        model_id="daanelson/minigpt-4",
        node_name="MiniGPT4",
        namespace="image.analyze",
        return_type=str,
    )

    replicate_node(
        model_id="lucataco/nsfw_image_detection",
        node_name="NSFWImageDetection",
        namespace="image.analyze",
        return_type=str,
    )

    replicate_node(
        model_id="yorickvp/llava-v1.6-34b",
        node_name="Llava34B",
        namespace="image.analyze",
        return_type=str,
        overrides={"image": ImageRef},
    )

    replicate_node(
        model_id="salesforce/blip",
        node_name="Blip",
        namespace="image.analyze",
        return_type=str,
        overrides={"image": ImageRef},
    )

    replicate_node(
        model_id="andreasjansson/blip-2",
        node_name="Blip2",
        namespace="image.analyze",
        return_type=str,
        overrides={"image": ImageRef},
    )

    replicate_node(
        model_id="pharmapsychotic/clip-interrogator",
        node_name="ClipInterrogator",
        namespace="image.analyze",
        return_type=str,
        overrides={"image": ImageRef},
    )

    replicate_node(
        node_name="Llava13b",
        namespace="image.analyze",
        model_id="yorickvp/llava-13b",
        return_type=str,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        model_id="meta/meta-llama-3-8b",
        node_name="Llama3_8B",
        namespace="text.generate",
        return_type=str,
    )

    replicate_node(
        model_id="meta/meta-llama-3-70b",
        node_name="Llama3_70B",
        namespace="text.generate",
        return_type=str,
    )

    replicate_node(
        model_id="meta/meta-llama-3-8b-instruct",
        node_name="Llama3_8B_Instruct",
        namespace="text.generate",
        return_type=str,
    )

    replicate_node(
        model_id="meta/meta-llama-3-70b-instruct",
        node_name="Llama3_70B_Instruct",
        namespace="text.generate",
        return_type=str,
    )

    replicate_node(
        model_id="openai/whisper",
        node_name="Whisper",
        namespace="audio.transcribe",
        return_type=str,
        overrides={
            "audio": AudioRef,
        },
    )

    replicate_node(
        model_id="vaibhavs10/incredibly-fast-whisper",
        node_name="IncrediblyFastWhisper",
        namespace="audio.transcribe",
        return_type=str,
        overrides={
            "audio": AudioRef,
        },
    )

    replicate_node(
        node_name="AudioSuperResolution",
        namespace="audio.enhance",
        model_id="nateraw/audio-super-resolution",
        return_type=AudioRef,
        overrides={
            "input_file": AudioRef,
        },
    )

    replicate_node(
        node_name="RemoveBackground",
        namespace="image.process",
        model_id="cjwbw/rembg",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        node_name="ModNet",
        namespace="image.process",
        model_id="pollinations/modnet",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        node_name="CodeFormer",
        namespace="image.enhance",
        model_id="lucataco/codeformer",
        return_type=ImageRef,
        overrides={
            "image": ImageRef,
        },
    )

    replicate_node(
        node_name="RealisticVoiceCloning",
        namespace="audio.generate",
        model_id="zsxkib/realistic-voice-cloning",
        return_type=AudioRef,
        overrides={
            "song_input": AudioRef,
        },
    )

    replicate_node(
        node_name="Riffusion",
        namespace="audio.generate",
        model_id="riffusion/riffusion",
        return_type=AudioRef,
        output_key="audio",
        overrides={
            "song_input": AudioRef,
        },
    )

    replicate_node(
        node_name="Bark",
        namespace="audio.generate",
        model_id="suno-ai/bark",
        return_type=AudioRef,
        output_key="audio_out",
    )

    replicate_node(
        node_name="MusicGen",
        namespace="audio.generate",
        model_id="meta/musicgen",
        return_type=AudioRef,
    )

    replicate_node(
        node_name="VideoLlava",
        namespace="video.analyze",
        model_id="nateraw/video-llava",
        return_type=str,
        overrides={
            "video_path": VideoRef,
            "image_path": ImageRef,
        },
    )

    replicate_node(
        node_name="AudioToWaveform",
        namespace="video.generate",
        model_id="fofr/audio-to-waveform",
        return_type=VideoRef,
        overrides={
            "audio": AudioRef,
        },
    )
