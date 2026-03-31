"""
AI Product Launch Video Generator DSL Example

Create a realistic 16:9 marketing video for a new product launch using the TextToVideo node.

Workflow:
1. **Collect Campaign Inputs** - Marketing brief, audience, and tone
2. **Craft Video Prompt** - Assemble a cinematic prompt from structured inputs
3. **Generate Video** - Produce a high-definition clip with AI text-to-video
4. **Output Asset** - Save the generated video for review and editing
"""

from nodetool.dsl.graph import create_graph, run_graph_sync
from nodetool.dsl.nodetool.input import StringInput
from nodetool.dsl.nodetool.text import FormatText
from nodetool.dsl.nodetool.agents import Agent
from nodetool.dsl.nodetool.video import TextToVideo
from nodetool.dsl.nodetool.output import Output
from nodetool.metadata.types import Provider, VideoModel, LanguageModel
from nodetool.workflows.processing_context import AssetOutputMode


campaign_brief = StringInput(
    name="campaign_brief",
    description="Short description of the campaign concept",
    value="Launch video for the Aurora Trail smart fitness watch, highlighting outdoor adventure tracking.",
)

target_audience = StringInput(
    name="target_audience",
    description="Primary audience for the marketing video",
    value="active millennials who enjoy weekend hiking and fitness challenges",
)

tone = StringInput(
    name="tone",
    description="Desired tone or mood for the video",
    value="inspiring, cinematic, and energetic",
)

key_features = StringInput(
    name="key_features",
    description="Key product features to highlight",
    value="GPS navigation, heart-rate analytics, adaptive coaching, water resistance",
)

# Agent: Craft an optimized Sora prompt from structured inputs
# The agent follows widely-adopted video prompting best practices:
# - Concrete subject, scene, action, and context
# - Camera language (shot size, lens, movement), composition and depth cues
# - Lighting/time-of-day, color palette, atmosphere, and texture details
# - Motion cues and pacing, realism and physical plausibility
# - Concise constraints: no text/logos/watermarks, avoid glitches
# - Keep it under ~150 words in one paragraph, present tense
sora_prompt_agent = Agent(
    prompt=FormatText(
        template="""
Using the marketing inputs, write an OpenAI Sora prompt for a single 16:9 product launch shot.

Rules:
- Do not specify resolution or duration in text (those are API parameters).
- Present tense, visually concrete; one clear camera move and one primary subject action.
- Include: subject, setting, time-of-day, camera language (framing, angle, lens, movement), composition cues, lighting, 3–5 color anchors, atmosphere/texture, and realistic motion cues.
- Emphasize the product and key features naturally within the scene for the target audience and tone.
- If useful, end with an optional Dialogue: block (short, natural lines) and/or Background Sound: line; otherwise omit.
- Finish with constraints: no on-screen text, no logos, no watermarks, no glitches, no distorted anatomy.

Inputs:
- Campaign brief: {{ brief }}
- Target audience: {{ audience }}
- Desired tone: {{ tone }}
- Key features: {{ features }}
""".strip(),
        brief=campaign_brief.output,
        audience=target_audience.output,
        features=key_features.output,
        tone=tone.output,
    ).output,
    model=LanguageModel(
        type="language_model",
        id="gpt-4o-mini",
        provider=Provider.OpenAI,
    ),
    system=(
        "You are a senior video prompt engineer for OpenAI Sora. "
        "Follow Sora best practices: describe the shot like a storyboard—subject, setting, action beats, and camera. "
        "Be specific about camera framing and movement (e.g., wide establishing, eye level, 50mm, slow push-in), depth cues, composition (rule of thirds, leading lines), "
        "lighting and color anchors (name 3–5 colors), and atmosphere/texture (mist, rain on asphalt). "
        "Keep motion simple and grounded with one clear camera move and one primary subject action. "
        "Support continuity and realism (plausible physics, natural motion, environmental interaction). "
        "Do not mention size/resolution or clip length; those are set via API, not prose. "
        "Use present tense and avoid abstract phrasing and meta commentary. If dialogue adds clarity, include a short 'Dialogue:' block; otherwise omit. "
        "End with constraints: no on-screen text, no logos, no watermarks, no glitches, no distorted anatomy."
    ),
    max_tokens=600,
)

negative_prompt = FormatText(
    template="""
Avoid glitch art, distorted anatomy, floating objects, text overlays, watermarks, or unrealistic facial expressions.
""".strip(),
)

video_generator = TextToVideo(
    model=VideoModel(
        type="video_model",
        provider=Provider.OpenAI,
        id="sora-2",
        name="Sora 2",
    ),
    prompt=sora_prompt_agent.out.text,
    negative_prompt=negative_prompt.output,
    aspect_ratio=TextToVideo.AspectRatio.RATIO_16_9,
    resolution=TextToVideo.Resolution.HD,
    num_frames=120,
    guidance_scale=9.0,
    num_inference_steps=40,
    seed=12345,
)

video_output = Output(
    name="product_launch_video",
    description="Generated marketing video for the Aurora Trail watch",
    value=video_generator.output,
)

# Create the graph
graph = create_graph(video_output)


if __name__ == "__main__":
    result = run_graph_sync(graph, asset_output_mode=AssetOutputMode.WORKSPACE)
    print(f"Generated video asset: {result['product_launch_video']}")
