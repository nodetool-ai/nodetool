"""
Image to Video Animation DSL Example

Generate a high-quality still from text, then animate it into a short cinematic clip.

Workflow:
1. **Text → Still Image** – Create a hero frame using TextToImage (gpt-image)
2. **Creative Direction** – Capture story beat and motion cues from the user
3. **Prompt Assembly** – Blend scene description with motion guidance
4. **Image → Video** – Animate the still using Sora (sora-2)
5. **Video Output** – Export the rendered clip to the workspace
"""

from nodetool.dsl.graph import create_graph, run_graph
from nodetool.workflows.processing_context import AssetOutputMode
from nodetool.dsl.nodetool.input import StringInput
from nodetool.dsl.nodetool.output import Output
from nodetool.dsl.nodetool.text import FormatText
from nodetool.dsl.nodetool.image import TextToImage
from nodetool.dsl.nodetool.video import ImageToVideo
from nodetool.metadata.types import ImageModel, VideoModel, Provider


# --- Creative Direction ------------------------------------------------------
scene_prompt = StringInput(
    name="scene_prompt",
    description="High-level description of the mood, setting, and visual tone",
    value="Moody twilight ocean scene with cinematic lighting",
)

motion_prompt = StringInput(
    name="motion_prompt",
    description="Movement cues that the animation should follow",
    value="Slow dolly push toward the horizon as waves shimmer with reflective highlights",
)

duration_prompt = StringInput(
    name="duration_prompt",
    description="Short descriptor for pacing and clip duration",
    value="8 second dramatic reveal",
)

# --- Text → Image (gpt-image) ------------------------------------------------
# Use OpenAI GPT-Image to synthesize a still hero frame from the scene prompt.
image_model = ImageModel(
    type="image_model",
    provider=Provider.OpenAI,
    id="gpt-image-1",
    name="GPT-Image 1",
)

still_image = TextToImage(
    model=image_model,
    prompt=scene_prompt.output,
    width=1280,
    height=720,
)

# Combine the creative directives into a single generator prompt.
video_prompt = FormatText(
    template=(
        "Transform the reference frame into a cinematic ocean scene. "
        "Scene: {{ scene }}. Motion: {{ motion }}. Duration: {{ duration }}. "
        "Keep the animation cohesive, with gentle camera movement and atmospheric particles."
    ),
    scene=scene_prompt.output,
    motion=motion_prompt.output,
    duration=duration_prompt.output,
)

# Optional negative prompt to avoid unwanted artifacts (e.g., text overlays).
negative_prompt = StringInput(
    name="negative_prompt",
    description="Elements to avoid in the generated video",
    value="no watermarks, no text overlays, maintain realistic wave motion",
)

# --- Image to Video Generation -----------------------------------------------
video_model = VideoModel(
    type="video_model",
    provider=Provider.OpenAI,
    id="sora-2",
    name="Sora 2",
)

animated_video = ImageToVideo(
    image=still_image.output,
    model=video_model,
    prompt=video_prompt.output,
    negative_prompt=negative_prompt.output,
    aspect_ratio=ImageToVideo.AspectRatio.RATIO_16_9,
    resolution=ImageToVideo.Resolution.FULL_HD,
    num_frames=120,
    guidance_scale=8.0,
    num_inference_steps=28,
)

# --- Output ------------------------------------------------------------------
video_output = Output(
    name="animated_clip",
    description="AI-generated cinematic video based on the supplied reference frame",
    value=animated_video.output,
)

# Build the graph so the workflow can be executed or exported.
graph = create_graph(video_output)


if __name__ == "__main__":
    result = run_graph(graph, asset_output_mode=AssetOutputMode.WORKSPACE)
    print(f"Animated video saved to workspace: {result}")
