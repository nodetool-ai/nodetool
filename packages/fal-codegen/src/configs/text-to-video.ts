import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "fal-ai/hunyuan-video": {
      className: "HunyuanVideo",
      docstring:
        "Hunyuan Video is Tencent's advanced text-to-video model for high-quality video generation.",
      tags: ["video", "generation", "hunyuan", "text-to-video", "txt2vid"],
      useCases: [
        "Generate cinematic videos from text descriptions",
        "Create marketing videos from product descriptions",
        "Produce educational video content",
        "Generate creative video concepts",
        "Create animated scenes from stories"
      ],
      basicFields: ["prompt", "aspect_ratio", "resolution"]
    },

    "fal-ai/cogvideox-5b": {
      className: "CogVideoX5B",
      docstring:
        "CogVideoX-5B is a powerful open-source text-to-video generation model with 5 billion parameters.",
      tags: ["video", "generation", "cogvideo", "text-to-video", "txt2vid"],
      useCases: [
        "Generate detailed videos from text prompts",
        "Create animated storytelling content",
        "Produce concept videos for pitches",
        "Generate video storyboards",
        "Create educational demonstrations"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/fast-animatediff/text-to-video": {
      className: "AnimateDiffTextToVideo",
      docstring:
        "AnimateDiff generates smooth animations from text prompts using diffusion models.",
      tags: [
        "video",
        "generation",
        "animatediff",
        "animation",
        "text-to-video",
        "txt2vid"
      ],
      useCases: [
        "Animate ideas from text descriptions",
        "Create animated content quickly",
        "Generate motion graphics from prompts",
        "Produce animated concept art",
        "Create video loops and sequences"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/fast-animatediff/turbo/text-to-video": {
      className: "AnimateDiffTurboTextToVideo",
      docstring:
        "AnimateDiff Turbo generates animations at lightning speed with reduced steps.",
      tags: [
        "video",
        "generation",
        "animatediff",
        "turbo",
        "fast",
        "text-to-video",
        "txt2vid"
      ],
      useCases: [
        "Rapidly prototype video animations",
        "Create quick video previews",
        "Generate animations with minimal latency",
        "Iterate on video concepts quickly",
        "Produce real-time animation effects"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/animatediff-sparsectrl-lcm": {
      className: "AnimateDiffSparseCtrlLCM",
      docstring:
        "AnimateDiff SparseCtrl LCM animates drawings with latent consistency models for fast generation.",
      tags: [
        "video",
        "generation",
        "animatediff",
        "sparsectrl",
        "lcm",
        "animation",
        "text-to-video"
      ],
      useCases: [
        "Animate hand-drawn sketches",
        "Bring drawings to life",
        "Create animated illustrations",
        "Generate animations from concept art",
        "Produce animation from sparse frames"
      ],
      basicFields: ["prompt"]
    },

    "veed/avatars/text-to-video": {
      className: "VeedAvatarsTextToVideo",
      docstring:
        "VEED Avatars generates talking avatar videos from text using realistic AI-powered characters.",
      tags: [
        "video",
        "generation",
        "avatar",
        "talking-head",
        "veed",
        "text-to-video"
      ],
      useCases: [
        "Create talking avatar presentations",
        "Generate spokesperson videos",
        "Produce educational talking head videos",
        "Create personalized video messages",
        "Generate multilingual avatar content"
      ],
      basicFields: ["prompt"]
    },

    "argil/avatars/text-to-video": {
      className: "ArgilAvatarsTextToVideo",
      docstring:
        "Argil Avatars creates realistic talking avatar videos from text descriptions.",
      tags: [
        "video",
        "generation",
        "avatar",
        "talking-head",
        "argil",
        "text-to-video"
      ],
      useCases: [
        "Generate avatar spokesperson videos",
        "Create virtual presenter content",
        "Produce automated video announcements",
        "Generate character-based narratives",
        "Create social media avatar videos"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/bytedance/seedance/v1.5/pro/text-to-video": {
      className: "SeeDanceV15ProTextToVideo",
      docstring:
        "SeeDance v1.5 Pro from ByteDance generates high-quality dance videos from text prompts.",
      tags: [
        "video",
        "generation",
        "dance",
        "seedance",
        "bytedance",
        "text-to-video"
      ],
      useCases: [
        "Generate dance choreography videos",
        "Create dance performance visualizations",
        "Produce music video concepts",
        "Generate dance training content",
        "Create dance animation prototypes"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/bytedance/seedance/v1/pro/fast/text-to-video": {
      className: "SeeDanceV1ProFastTextToVideo",
      docstring:
        "SeeDance v1 Pro Fast generates dance videos quickly from text with reduced generation time.",
      tags: [
        "video",
        "generation",
        "dance",
        "seedance",
        "fast",
        "bytedance",
        "text-to-video"
      ],
      useCases: [
        "Rapidly prototype dance videos",
        "Create quick dance previews",
        "Generate dance concepts efficiently",
        "Iterate on choreography ideas",
        "Produce dance storyboards"
      ],
      basicFields: ["prompt"]
    },

    "veed/fabric-1.0/text": {
      className: "VeedFabric10Text",
      docstring:
        "VEED Fabric 1.0 generates video content from text using advanced video synthesis.",
      tags: [
        "video",
        "generation",
        "fabric",
        "veed",
        "text-to-video",
        "txt2vid"
      ],
      useCases: [
        "Generate marketing videos from text",
        "Create explainer video content",
        "Produce video ads from copy",
        "Generate social media videos",
        "Create branded video content"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/ltx-video": {
      className: "LTXVideo",
      docstring:
        "LTX Video generates high-quality videos from text prompts with advanced temporal consistency.",
      tags: ["video", "generation", "ltx", "text-to-video", "txt2vid"],
      useCases: [
        "Generate temporally consistent videos",
        "Create smooth video sequences",
        "Produce high-quality video content",
        "Generate professional video clips",
        "Create cinematic video scenes"
      ],
      basicFields: ["prompt", "aspect_ratio", "resolution"]
    },

    "fal-ai/kling-video/v1/standard/text-to-video": {
      className: "KlingVideoV1StandardTextToVideo",
      docstring:
        "Kling Video v1 Standard generates videos from text with balanced quality and speed.",
      tags: ["video", "generation", "kling", "text-to-video", "txt2vid"],
      useCases: [
        "Generate standard quality videos",
        "Create video content efficiently",
        "Produce videos for web use",
        "Generate video previews",
        "Create video concepts"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/kling-video/v1/pro/text-to-video": {
      className: "KlingVideoV1ProTextToVideo",
      docstring:
        "Kling Video v1 Pro generates high-quality professional videos from text prompts.",
      tags: ["video", "generation", "kling", "pro", "text-to-video", "txt2vid"],
      useCases: [
        "Generate professional grade videos",
        "Create high-quality marketing content",
        "Produce cinematic video sequences",
        "Generate detailed video scenes",
        "Create premium video content"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/mochi-v1": {
      className: "MochiV1",
      docstring:
        "Mochi v1 generates creative videos from text with unique artistic style.",
      tags: [
        "video",
        "generation",
        "mochi",
        "artistic",
        "text-to-video",
        "txt2vid"
      ],
      useCases: [
        "Generate artistic video content",
        "Create stylized animations",
        "Produce creative video art",
        "Generate experimental videos",
        "Create unique visual content"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/runway-gen3/turbo/text-to-video": {
      className: "RunwayGen3TurboTextToVideo",
      docstring:
        "Runway Gen-3 Turbo generates videos quickly from text with high quality output.",
      tags: [
        "video",
        "generation",
        "runway",
        "gen3",
        "turbo",
        "text-to-video",
        "txt2vid"
      ],
      useCases: [
        "Generate videos rapidly from text",
        "Create quick video prototypes",
        "Produce fast video iterations",
        "Generate real-time video content",
        "Create efficient video workflows"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/stable-video": {
      className: "StableVideo",
      docstring:
        "Stable Video generates consistent and stable video sequences from text prompts.",
      tags: ["video", "generation", "stable", "text-to-video", "txt2vid"],
      useCases: [
        "Generate stable video sequences",
        "Create consistent video content",
        "Produce reliable video outputs",
        "Generate predictable video scenes",
        "Create controlled video generation"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/t2v-turbo": {
      className: "T2VTurbo",
      docstring:
        "T2V Turbo generates videos from text at high speed with optimized performance.",
      tags: [
        "video",
        "generation",
        "turbo",
        "fast",
        "text-to-video",
        "txt2vid"
      ],
      useCases: [
        "Generate videos with minimal latency",
        "Create rapid video prototypes",
        "Produce quick video previews",
        "Generate real-time video content",
        "Create efficient video workflows"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/wan-cinematic": {
      className: "WanCinematic",
      docstring:
        "Wan Cinematic generates cinematic quality videos from text with professional aesthetics.",
      tags: [
        "video",
        "generation",
        "cinematic",
        "professional",
        "text-to-video",
        "txt2vid"
      ],
      useCases: [
        "Generate cinematic video sequences",
        "Create film-quality content",
        "Produce professional video clips",
        "Generate movie-like scenes",
        "Create dramatic video content"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/minimax-video/v1": {
      className: "MinimaxVideoV1",
      docstring:
        "Minimax Video v1 generates videos from text with efficient resource usage.",
      tags: ["video", "generation", "minimax", "text-to-video", "txt2vid"],
      useCases: [
        "Generate videos efficiently",
        "Create video content with minimal resources",
        "Produce lightweight video outputs",
        "Generate scalable video content",
        "Create optimized video workflows"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/minimax-video/v1/turbo": {
      className: "MinimaxVideoV1Turbo",
      docstring:
        "Minimax Video v1 Turbo generates videos from text at maximum speed.",
      tags: [
        "video",
        "generation",
        "minimax",
        "turbo",
        "fast",
        "text-to-video",
        "txt2vid"
      ],
      useCases: [
        "Generate videos at maximum speed",
        "Create rapid video iterations",
        "Produce instant video previews",
        "Generate real-time video responses",
        "Create ultra-fast video workflows"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/pyramidflow": {
      className: "PyramidFlow",
      docstring:
        "PyramidFlow generates videos with hierarchical processing for smooth motion.",
      tags: [
        "video",
        "generation",
        "pyramid",
        "flow",
        "text-to-video",
        "txt2vid"
      ],
      useCases: [
        "Generate smooth motion videos",
        "Create fluid video animations",
        "Produce high-quality motion sequences",
        "Generate temporally coherent videos",
        "Create professional motion graphics"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/luma-dream-machine": {
      className: "LumaDreamMachineTextToVideo",
      docstring:
        "Luma Dream Machine generates creative videos from text with dreamlike aesthetics.",
      tags: [
        "video",
        "generation",
        "luma",
        "dream-machine",
        "text-to-video",
        "txt2vid"
      ],
      useCases: [
        "Generate dreamlike video content",
        "Create surreal video sequences",
        "Produce artistic video interpretations",
        "Generate creative video concepts",
        "Create imaginative video art"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/luma-photon": {
      className: "LumaPhoton",
      docstring:
        "Luma Photon generates photorealistic videos from text with high visual fidelity.",
      tags: [
        "video",
        "generation",
        "luma",
        "photon",
        "photorealistic",
        "text-to-video"
      ],
      useCases: [
        "Generate photorealistic video content",
        "Create realistic video simulations",
        "Produce lifelike video scenes",
        "Generate high-fidelity video outputs",
        "Create realistic visual content"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/luma-photon-flash": {
      className: "LumaPhotonFlashVideo",
      docstring:
        "Luma Photon Flash generates photorealistic videos quickly with optimized speed.",
      tags: [
        "video",
        "generation",
        "luma",
        "photon",
        "flash",
        "fast",
        "text-to-video"
      ],
      useCases: [
        "Generate photorealistic videos rapidly",
        "Create realistic video previews",
        "Produce fast photorealistic content",
        "Generate quick realistic sequences",
        "Create efficient realistic workflows"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/luma-ray2": {
      className: "LumaRay2",
      docstring:
        "Luma Ray2 generates advanced video content with improved ray tracing techniques.",
      tags: [
        "video",
        "generation",
        "luma",
        "ray2",
        "advanced",
        "text-to-video"
      ],
      useCases: [
        "Generate ray-traced video content",
        "Create advanced lighting effects",
        "Produce high-quality rendered videos",
        "Generate realistic lighting sequences",
        "Create professional visual effects"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/luma-ray2/turbo": {
      className: "LumaRay2Turbo",
      docstring:
        "Luma Ray2 Turbo generates ray-traced videos with optimized rendering speed.",
      tags: [
        "video",
        "generation",
        "luma",
        "ray2",
        "turbo",
        "fast",
        "text-to-video"
      ],
      useCases: [
        "Generate ray-traced videos quickly",
        "Create fast rendered previews",
        "Produce efficient visual effects",
        "Generate rapid lighting iterations",
        "Create optimized rendering workflows"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/qihoo-t2v": {
      className: "QihooT2V",
      docstring:
        "Qihoo T2V generates videos from text with Chinese language optimization.",
      tags: [
        "video",
        "generation",
        "qihoo",
        "chinese",
        "text-to-video",
        "txt2vid"
      ],
      useCases: [
        "Generate videos from Chinese text",
        "Create multilingual video content",
        "Produce localized video scenes",
        "Generate culturally relevant videos",
        "Create international video content"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/wan-show-1": {
      className: "WanShow1",
      docstring:
        "Wan Show 1 generates presentation-style videos from text for showcasing ideas.",
      tags: [
        "video",
        "generation",
        "presentation",
        "showcase",
        "text-to-video"
      ],
      useCases: [
        "Generate presentation videos",
        "Create showcase content",
        "Produce pitch videos",
        "Generate demo videos",
        "Create educational presentations"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/luma-photon/v2": {
      className: "LumaPhotonV2",
      docstring:
        "Luma Photon v2 generates photorealistic videos with improved quality and detail.",
      tags: [
        "video",
        "generation",
        "luma",
        "photon",
        "v2",
        "photorealistic",
        "text-to-video"
      ],
      useCases: [
        "Generate high-quality photorealistic videos",
        "Create detailed realistic scenes",
        "Produce cinematic realistic content",
        "Generate professional video outputs",
        "Create premium photorealistic sequences"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/luma-dream-machine/v1.6": {
      className: "LumaDreamMachineV16",
      docstring:
        "Luma Dream Machine v1.6 generates creative videos with enhanced dream-like effects.",
      tags: [
        "video",
        "generation",
        "luma",
        "dream-machine",
        "v1.6",
        "text-to-video"
      ],
      useCases: [
        "Generate enhanced dreamlike videos",
        "Create surreal video art",
        "Produce creative visual content",
        "Generate artistic video sequences",
        "Create imaginative video effects"
      ],
      basicFields: ["prompt"]
    },

    "fal-ai/pixverse/v5.6/text-to-video": {
      className: "PixverseV56TextToVideo",
      docstring: "Pixverse",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/ltx-2-19b/distilled/text-to-video/lora": {
      className: "Ltx219BDistilledTextToVideoLora",
      docstring: "LTX-2 19B Distilled",
      tags: ["video", "generation", "text-to-video", "txt2vid", "lora"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/ltx-2-19b/distilled/text-to-video": {
      className: "Ltx219BDistilledTextToVideo",
      docstring: "LTX-2 19B Distilled",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/ltx-2-19b/text-to-video/lora": {
      className: "Ltx219BTextToVideoLora",
      docstring: "LTX-2 19B",
      tags: ["video", "generation", "text-to-video", "txt2vid", "lora"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/ltx-2-19b/text-to-video": {
      className: "Ltx219BTextToVideo",
      docstring: "LTX-2 19B",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/kandinsky5-pro/text-to-video": {
      className: "Kandinsky5ProTextToVideo",
      docstring: "Kandinsky5 Pro",
      tags: ["video", "generation", "text-to-video", "txt2vid", "professional"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "wan/v2.6/text-to-video": {
      className: "WanV26TextToVideo",
      docstring: "Wan v2.6 Text to Video",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/kling-video/v2.6/pro/text-to-video": {
      className: "KlingVideoV26ProTextToVideo",
      docstring: "Kling Video v2.6 Text to Video",
      tags: ["video", "generation", "text-to-video", "txt2vid", "professional"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/pixverse/v5.5/text-to-video": {
      className: "PixverseV55TextToVideo",
      docstring: "Pixverse",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/ltx-2/text-to-video/fast": {
      className: "Ltx2TextToVideoFast",
      docstring: "LTX Video 2.0 Fast",
      tags: ["video", "generation", "text-to-video", "txt2vid", "fast"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/ltx-2/text-to-video": {
      className: "Ltx2TextToVideo",
      docstring: "LTX Video 2.0 Pro",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/hunyuan-video-v1.5/text-to-video": {
      className: "HunyuanVideoV15TextToVideo",
      docstring: "Hunyuan Video V1.5",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/infinity-star/text-to-video": {
      className: "InfinityStarTextToVideo",
      docstring: "Infinity Star",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/sana-video": {
      className: "SanaVideo",
      docstring: "Sana Video",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/longcat-video/text-to-video/720p": {
      className: "LongcatVideoTextToVideo720P",
      docstring: "LongCat Video",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/longcat-video/text-to-video/480p": {
      className: "LongcatVideoTextToVideo480P",
      docstring: "LongCat Video",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/longcat-video/distilled/text-to-video/720p": {
      className: "LongcatVideoDistilledTextToVideo720P",
      docstring: "LongCat Video Distilled",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/longcat-video/distilled/text-to-video/480p": {
      className: "LongcatVideoDistilledTextToVideo480P",
      docstring: "LongCat Video Distilled",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/minimax/hailuo-2.3/standard/text-to-video": {
      className: "MinimaxHailuo23StandardTextToVideo",
      docstring: "MiniMax Hailuo 2.3 [Standard] (Text to Video)",
      tags: ["video", "generation", "text-to-video", "txt2vid", "professional"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/minimax/hailuo-2.3/pro/text-to-video": {
      className: "MinimaxHailuo23ProTextToVideo",
      docstring: "MiniMax Hailuo 2.3 [Pro] (Text to Video)",
      tags: ["video", "generation", "text-to-video", "txt2vid", "professional"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/vidu/q2/text-to-video": {
      className: "ViduQ2TextToVideo",
      docstring: "Vidu",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/krea-wan-14b/text-to-video": {
      className: "KreaWan14BTextToVideo",
      docstring: "Krea Wan 14b- Text to Video",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/wan-alpha": {
      className: "WanAlpha",
      docstring: "Wan Alpha",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/kandinsky5/text-to-video/distill": {
      className: "Kandinsky5TextToVideoDistill",
      docstring: "Kandinsky5",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/kandinsky5/text-to-video": {
      className: "Kandinsky5TextToVideo",
      docstring: "Kandinsky5",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/veo3.1/fast": {
      className: "Veo31Fast",
      docstring: "Veo 3.1 Fast",
      tags: ["video", "generation", "text-to-video", "txt2vid", "fast"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/veo3.1": {
      className: "Veo31",
      docstring: "Veo 3.1",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/sora-2/text-to-video/pro": {
      className: "Sora2TextToVideoPro",
      docstring: "Sora 2",
      tags: ["video", "generation", "text-to-video", "txt2vid", "professional"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/sora-2/text-to-video": {
      className: "Sora2TextToVideo",
      docstring: "Sora 2",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/ovi": {
      className: "Ovi",
      docstring: "Ovi Text to Video",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/wan-25-preview/text-to-video": {
      className: "Wan25PreviewTextToVideo",
      docstring: "Wan 2.5 Text to Video",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/pixverse/v5/text-to-video": {
      className: "PixverseV5TextToVideo",
      docstring: "Pixverse",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/infinitalk/single-text": {
      className: "InfinitalkSingleText",
      docstring: "Infinitalk",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "moonvalley/marey/t2v": {
      className: "MoonvalleyMareyT2V",
      docstring: "Marey Realism V1.5",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/wan/v2.2-a14b/text-to-video/lora": {
      className: "WanV22A14bTextToVideoLora",
      docstring:
        "Wan-2.2 text-to-video is a video model that generates high-quality videos with high visual quality and motion diversity from text prompts. This endpoint supports LoRAs made for Wan 2.2.",
      tags: ["video", "generation", "text-to-video", "txt2vid", "lora"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/wan/v2.2-5b/text-to-video/distill": {
      className: "WanV225bTextToVideoDistill",
      docstring:
        "Wan 2.2's 5B distill model produces up to 5 seconds of video 720p at 24FPS with fluid motion and powerful prompt understanding",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/wan/v2.2-5b/text-to-video/fast-wan": {
      className: "WanV225bTextToVideoFastWan",
      docstring:
        "Wan 2.2's 5B FastVideo model produces up to 5 seconds of video 720p at 24FPS with fluid motion and powerful prompt understanding",
      tags: ["video", "generation", "text-to-video", "txt2vid", "fast"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/wan/v2.2-a14b/text-to-video/turbo": {
      className: "WanV22A14bTextToVideoTurbo",
      docstring:
        "Wan-2.2 turbo text-to-video is a video model that generates high-quality videos with high visual quality and motion diversity from text prompts. ",
      tags: ["video", "generation", "text-to-video", "txt2vid", "fast"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/wan/v2.2-5b/text-to-video": {
      className: "WanV225bTextToVideo",
      docstring:
        "Wan 2.2's 5B model produces up to 5 seconds of video 720p at 24FPS with fluid motion and powerful prompt understanding",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/wan/v2.2-a14b/text-to-video": {
      className: "WanV22A14bTextToVideo",
      docstring:
        "Wan-2.2 text-to-video is a video model that generates high-quality videos with high visual quality and motion diversity from text prompts. ",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/ltxv-13b-098-distilled": {
      className: "Ltxv13b098Distilled",
      docstring:
        "Generate long videos from prompts using LTX Video-0.9.8 13B Distilled and custom LoRA",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/minimax/hailuo-02/pro/text-to-video": {
      className: "MinimaxHailuo02ProTextToVideo",
      docstring:
        "MiniMax Hailuo-02 Text To Video API (Pro, 1080p): Advanced video generation model with 1080p resolution",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/bytedance/seedance/v1/pro/text-to-video": {
      className: "BytedanceSeedanceV1ProTextToVideo",
      docstring:
        "Seedance 1.0 Pro, a high quality video generation model developed by Bytedance.",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/bytedance/seedance/v1/lite/text-to-video": {
      className: "BytedanceSeedanceV1LiteTextToVideo",
      docstring: "Seedance 1.0 Lite",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/kling-video/v2.1/master/text-to-video": {
      className: "KlingVideoV21MasterTextToVideo",
      docstring:
        "Kling 2.1 Master: The premium endpoint for Kling 2.1, designed for top-tier text-to-video generation with unparalleled motion fluidity, cinematic visuals, and exceptional prompt precision.",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/ltx-video-13b-dev": {
      className: "LtxVideo13bDev",
      docstring:
        "Generate videos from prompts using LTX Video-0.9.7 13B and custom LoRA",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/ltx-video-13b-distilled": {
      className: "LtxVideo13bDistilled",
      docstring:
        "Generate videos from prompts using LTX Video-0.9.7 13B Distilled and custom LoRA",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/pixverse/v4.5/text-to-video/fast": {
      className: "PixverseV45TextToVideoFast",
      docstring:
        "Generate high quality and fast video clips from text and image prompts using PixVerse v4.5 fast",
      tags: ["video", "generation", "text-to-video", "txt2vid", "fast"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/pixverse/v4.5/text-to-video": {
      className: "PixverseV45TextToVideo",
      docstring:
        "Generate high quality video clips from text and image prompts using PixVerse v4.5",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/vidu/q1/text-to-video": {
      className: "ViduQ1TextToVideo",
      docstring:
        "Vidu Q1 Text to Video generates high-quality 1080p videos with exceptional visual quality and motion diversity",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/magi": {
      className: "Magi",
      docstring:
        "MAGI-1 is a video generation model with exceptional understanding of physical interactions and cinematic prompts",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/magi-distilled": {
      className: "MagiDistilled",
      docstring:
        "MAGI-1 distilled is a faster video generation model with exceptional understanding of physical interactions and cinematic prompts",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/pixverse/v4/text-to-video": {
      className: "PixverseV4TextToVideo",
      docstring:
        "Generate high quality video clips from text and image prompts using PixVerse v4",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/pixverse/v4/text-to-video/fast": {
      className: "PixverseV4TextToVideoFast",
      docstring:
        "Generate high quality and fast video clips from text and image prompts using PixVerse v4 fast",
      tags: ["video", "generation", "text-to-video", "txt2vid", "fast"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/kling-video/lipsync/audio-to-video": {
      className: "KlingVideoLipsyncAudioToVideo",
      docstring:
        "Kling LipSync is an audio-to-video model that generates realistic lip movements from audio input.",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/kling-video/lipsync/text-to-video": {
      className: "KlingVideoLipsyncTextToVideo",
      docstring:
        "Kling LipSync is a text-to-video model that generates realistic lip movements from text input.",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/wan-t2v-lora": {
      className: "WanT2vLora",
      docstring:
        "Add custom LoRAs to Wan-2.1 is a text-to-video model that generates high-quality videos with high visual quality and motion diversity from images",
      tags: ["video", "generation", "text-to-video", "txt2vid", "lora"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/luma-dream-machine/ray-2-flash": {
      className: "LumaDreamMachineRay2Flash",
      docstring:
        "Ray2 Flash is a fast video generative model capable of creating realistic visuals with natural, coherent motion.",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/pika/v2.1/text-to-video": {
      className: "PikaV21TextToVideo",
      docstring:
        "Start with a simple text input to create dynamic generations that defy expectations. Anything you dream can come to life with sharp details, impressive character control and cinematic camera moves.",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/pika/v2.2/text-to-video": {
      className: "PikaV22TextToVideo",
      docstring:
        "Start with a simple text input to create dynamic generations that defy expectations in up to 1080p. Experience better image clarity and crisper, sharper visuals.",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/pika/v2/turbo/text-to-video": {
      className: "PikaV2TurboTextToVideo",
      docstring:
        "Pika v2 Turbo creates videos from a text prompt with high quality output.",
      tags: ["video", "generation", "text-to-video", "txt2vid", "fast"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/wan-pro/text-to-video": {
      className: "WanProTextToVideo",
      docstring:
        "Wan-2.1 Pro is a premium text-to-video model that generates high-quality 1080p videos at 30fps with up to 6 seconds duration, delivering exceptional visual quality and motion diversity from text prompts",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/kling-video/v1.6/pro/effects": {
      className: "KlingVideoV16ProEffects",
      docstring: "Generate video clips from your prompts using Kling 1.6 (pro)",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/kling-video/v1.6/standard/effects": {
      className: "KlingVideoV16StandardEffects",
      docstring: "Generate video clips from your prompts using Kling 1.6 (std)",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/kling-video/v1.5/pro/effects": {
      className: "KlingVideoV15ProEffects",
      docstring: "Generate video clips from your prompts using Kling 1.5 (pro)",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/kling-video/v1/standard/effects": {
      className: "KlingVideoV1StandardEffects",
      docstring: "Generate video clips from your prompts using Kling 1.0",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/ltx-video-v095": {
      className: "LtxVideoV095",
      docstring: "Generate videos from prompts using LTX Video-0.9.5",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/kling-video/v1.6/pro/text-to-video": {
      className: "KlingVideoV16ProTextToVideo",
      docstring: "Generate video clips from your prompts using Kling 1.6 (pro)",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/wan/v2.1/1.3b/text-to-video": {
      className: "WanV2113bTextToVideo",
      docstring:
        "Wan-2.1 1.3B is a text-to-video model that generates high-quality videos with high visual quality and motion diversity from text promptsat faster speeds.",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/wan-t2v": {
      className: "WanT2v",
      docstring:
        "Wan-2.1 is a text-to-video model that generates high-quality videos with high visual quality and motion diversity from text prompts",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/veo2": {
      className: "Veo2",
      docstring:
        "Veo 2 creates videos with realistic motion and high quality output. Explore different styles and find your own with extensive camera controls.",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/minimax/video-01-director": {
      className: "MinimaxVideo01Director",
      docstring:
        "Generate video clips more accurately with respect to natural language descriptions and using camera movement instructions for shot control.",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/pixverse/v3.5/text-to-video": {
      className: "PixverseV35TextToVideo",
      docstring:
        "Generate high quality video clips from text prompts using PixVerse v3.5",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/pixverse/v3.5/text-to-video/fast": {
      className: "PixverseV35TextToVideoFast",
      docstring:
        "Generate high quality video clips quickly from text prompts using PixVerse v3.5 Fast",
      tags: ["video", "generation", "text-to-video", "txt2vid", "fast"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/luma-dream-machine/ray-2": {
      className: "LumaDreamMachineRay2",
      docstring:
        "Ray2 is a large-scale video generative model capable of creating realistic visuals with natural, coherent motion.",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/hunyuan-video-lora": {
      className: "HunyuanVideoLora",
      docstring:
        "Hunyuan Video is an Open video generation model with high visual quality, motion diversity, text-video alignment, and generation stability",
      tags: ["video", "generation", "text-to-video", "txt2vid", "lora"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/transpixar": {
      className: "Transpixar",
      docstring:
        "Transform text into stunning videos with TransPixar - an AI model that generates both RGB footage and alpha channels, enabling seamless compositing and creative video effects.",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/kling-video/v1.6/standard/text-to-video": {
      className: "KlingVideoV16StandardTextToVideo",
      docstring: "Generate video clips from your prompts using Kling 1.6 (std)",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/minimax/video-01-live": {
      className: "MinimaxVideo01Live",
      docstring: "Generate video clips from your prompts using MiniMax model",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/kling-video/v1.5/pro/text-to-video": {
      className: "KlingVideoV15ProTextToVideo",
      docstring: "Generate video clips from your prompts using Kling 1.5 (pro)",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/fast-svd/text-to-video": {
      className: "FastSvdTextToVideo",
      docstring: "Generate short video clips from your prompts using SVD v1.1",
      tags: ["video", "generation", "text-to-video", "txt2vid", "fast"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/fast-svd-lcm/text-to-video": {
      className: "FastSvdLcmTextToVideo",
      docstring:
        "Generate short video clips from your images using SVD v1.1 at Lightning Speed",
      tags: ["video", "generation", "text-to-video", "txt2vid", "fast"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/minimax/video-01": {
      className: "MinimaxVideo01",
      docstring: "Generate video clips from your prompts using MiniMax model",
      tags: ["video", "generation", "text-to-video", "txt2vid"],
      useCases: [
        "AI-generated video content",
        "Marketing and advertising videos",
        "Educational content creation",
        "Social media video posts",
        "Automated video production"
      ]
    },

    "fal-ai/kling-video/v3/standard/text-to-video": {
      className: "KlingVideoV3StandardTextToVideo",
      docstring:
        "Kling Video V3 Standard generates videos from text prompts with balanced quality and speed using the latest V3 model.",
      tags: [
        "video",
        "generation",
        "kling",
        "v3",
        "standard",
        "text-to-video",
        "txt2vid"
      ],
      useCases: [
        "Generate cinematic videos from text descriptions",
        "Create marketing videos from product descriptions",
        "Produce educational video content from scripts",
        "Generate social media video content",
        "Create animated scenes from text prompts"
      ],
      basicFields: ["prompt", "duration", "aspect_ratio"]
    },

    "fal-ai/kling-video/v3/pro/text-to-video": {
      className: "KlingVideoV3ProTextToVideo",
      docstring:
        "Kling Video V3 Pro generates professional quality videos from text prompts with enhanced visual fidelity using the latest V3 model.",
      tags: [
        "video",
        "generation",
        "kling",
        "v3",
        "pro",
        "text-to-video",
        "txt2vid"
      ],
      useCases: [
        "Create professional-grade videos from detailed prompts",
        "Generate cinematic video content with precise motion",
        "Produce high-fidelity advertising videos",
        "Create premium animated content from scripts",
        "Generate top-tier video for film and media"
      ],
      basicFields: ["prompt", "duration", "aspect_ratio"]
    },

    "fal-ai/kling-video/o3/standard/text-to-video": {
      className: "KlingVideoO3StandardTextToVideo",
      docstring:
        "Kling Video O3 Standard generates videos from text prompts with balanced quality and speed.",
      tags: [
        "video",
        "generation",
        "kling",
        "o3",
        "standard",
        "text-to-video",
        "txt2vid"
      ],
      useCases: [
        "Generate cinematic videos from text descriptions",
        "Create marketing videos from product descriptions",
        "Produce educational video content from scripts",
        "Generate social media video content",
        "Create animated scenes from text prompts"
      ],
      basicFields: ["prompt", "duration", "aspect_ratio"]
    },

    "fal-ai/kling-video/o3/pro/text-to-video": {
      className: "KlingVideoO3ProTextToVideo",
      docstring:
        "Kling Video O3 Pro generates professional quality videos from text prompts with enhanced fidelity.",
      tags: [
        "video",
        "generation",
        "kling",
        "o3",
        "pro",
        "text-to-video",
        "txt2vid"
      ],
      useCases: [
        "Create professional-grade videos from detailed prompts",
        "Generate cinematic video content with precise motion",
        "Produce high-fidelity advertising videos",
        "Create premium animated content from scripts",
        "Generate top-tier video for film and media"
      ],
      basicFields: ["prompt", "duration", "aspect_ratio"]
    }
  }
};
