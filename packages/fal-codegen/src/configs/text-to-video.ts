import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "blackforestlabs/flux-3/text-to-video": {
      className: "Flux3TextToVideo",
      docstring:
        "FLUX 3 generates videos from text prompts with cinematic motion and detail.",
      tags: ["video", "generation", "text-to-video", "txt2vid", "flux-3"],
      useCases: [
        "Generate cinematic clips from a prompt",
        "Create b-roll for edits",
        "Produce animated concept sequences",
        "Generate short social videos",
        "Explore motion ideas before a full shoot"
      ]
    },

    "blackforestlabs/flux-3/text-to-video/draft": {
      className: "Flux3TextToVideoDraft",
      docstring:
        "FLUX 3 Draft generates low-cost preview videos from text, meant to be enhanced afterwards.",
      tags: [
        "video",
        "generation",
        "text-to-video",
        "txt2vid",
        "flux-3",
        "draft"
      ],
      useCases: [
        "Preview a prompt before paying for a full render",
        "Iterate quickly on shot ideas",
        "Generate rough cuts for review",
        "Test motion and framing cheaply",
        "Feed drafts into the enhance pass"
      ]
    },

    "minimax/h3/text-to-video": {
      className: "MinimaxH3TextToVideo",
      docstring:
        "MiniMax H3 generates videos from text prompts with smooth motion and strong prompt following.",
      tags: ["video", "generation", "text-to-video", "txt2vid", "minimax"],
      useCases: [
        "Generate videos from written scenes",
        "Create narrative shots for edits",
        "Produce stylized motion pieces",
        "Generate ads and promos",
        "Prototype sequences from a script"
      ]
    },

    "xai/grok-imagine-video/v1.5/text-to-video": {
      className: "GrokImagineVideoV15TextToVideo",
      docstring: "Grok Imagine Video 1.5 generates videos from text prompts.",
      tags: ["video", "generation", "text-to-video", "txt2vid", "grok", "xai"],
      useCases: [
        "Generate clips from a written prompt",
        "Create social media videos",
        "Produce stylized animations",
        "Explore visual ideas fast",
        "Generate short promotional videos"
      ]
    },

    "fal-ai/kling-video/v2.5-turbo/pro/text-to-video": {
      className: "KlingVideoV25TurboProTextToVideo",
      docstring:
        "Kling 2.5 Turbo Pro generates high-quality videos from text with fast turnaround.",
      tags: [
        "video",
        "generation",
        "text-to-video",
        "txt2vid",
        "kling",
        "turbo"
      ],
      useCases: [
        "Generate pro-quality clips from prompts",
        "Create cinematic short sequences",
        "Produce videos on a tight deadline",
        "Generate marketing footage",
        "Iterate on shots quickly"
      ]
    },

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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
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
      ]
    },
    "bytedance/seedance-2.0/text-to-video": {
      className: "BytedanceSeedance20TextToVideo",
      docstring: "Generate videos from text using ByteDance Seedance 2.0.",
      tags: ["generation", "text-to-video", "txt2vid", "seedance", "bytedance"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "bytedance/seedance-2.0/fast/text-to-video": {
      className: "BytedanceSeedance20FastTextToVideo",
      docstring: "Fast text-to-video with ByteDance Seedance 2.0.",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "seedance",
        "bytedance",
        "fast"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "alibaba/happy-horse/text-to-video": {
      className: "AlibabaHappyHorseTextToVideo",
      docstring: "Generate videos from text with Alibaba Happy Horse.",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "happy-horse",
        "alibaba"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/kling-video/o3/4k/text-to-video": {
      className: "KlingVideoO34kTextToVideo",
      docstring: "Kling Video O3 4K text-to-video generation.",
      tags: ["generation", "text-to-video", "txt2vid", "kling", "4k"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/kling-video/v3/4k/text-to-video": {
      className: "KlingVideoV34kTextToVideo",
      docstring: "Kling Video v3 4K text-to-video generation.",
      tags: ["generation", "text-to-video", "txt2vid", "kling", "4k"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/heygen/v3/video-agent": {
      className: "HeygenV3VideoAgent",
      docstring: "HeyGen v3 Video Agent: generate avatar videos from text.",
      tags: ["generation", "text-to-video", "txt2vid", "heygen", "avatar"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "alibaba/happy-horse/v1.1/text-to-video": {
      className: "HappyHorseV11TextToVideo",
      docstring:
        "Happy Horse 1.1 is Alibaba's #1-ranked video model. This text-to-video endpoint generates 1080p video with synchronized native audio and multilingual lip-sync from a text prompt alone.",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "alibaba",
        "happy",
        "horse"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "bytedance/seedance-2.0/mini/text-to-video": {
      className: "Seedance20MiniTextToVideo",
      docstring:
        "Seedance 2.0 Mini is a faster version of Seedance 2.0 that brings great performance and high generation speed at a lower cost.",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "bytedance",
        "seedance",
        "mini"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/bernini-r/text-to-video": {
      className: "BerniniRTextToVideo",
      docstring:
        "Generate high-quality video from a text prompt with Bernini-R, ByteDance's unified video generation and editing model.",
      tags: ["generation", "text-to-video", "txt2vid", "bernini"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/cosmos-predict-2.5/distilled/text-to-video": {
      className: "CosmosPredict25DistilledTextToVideo",
      docstring:
        "Generate video from text and videos using NVIDIA's 2B Cosmos Distilled Model",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "cosmos",
        "predict",
        "distilled"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/cosmos-predict-2.5/text-to-video": {
      className: "CosmosPredict25TextToVideo",
      docstring:
        "Generate video from text using NVIDIA's 2B Cosmos Post-Trained Model",
      tags: ["generation", "text-to-video", "txt2vid", "cosmos", "predict"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/heygen/avatar3/digital-twin": {
      className: "HeygenAvatar3DigitalTwin",
      docstring: "Heygen Avatar V3 Model for Digital Twin",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "heygen",
        "avatar3",
        "digital",
        "twin"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/heygen/avatar4/digital-twin": {
      className: "HeygenAvatar4DigitalTwin",
      docstring: "Heygen Avatar 4 Digital Twin Model",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "heygen",
        "avatar4",
        "digital",
        "twin"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/heygen/avatar5/digital-twin": {
      className: "HeygenAvatar5DigitalTwin",
      docstring:
        "Create natural HeyGen Avatar V digital twin videos from text or audio, with lip-sync, optional backgrounds, captions, and MP4/WebM output.",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "heygen",
        "avatar5",
        "digital",
        "twin"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/heygen/v2/video-agent": {
      className: "HeygenV2VideoAgent",
      docstring: "Heygen Text to Video Generation Model",
      tags: ["generation", "text-to-video", "txt2vid", "heygen", "agent"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/kling-video/v3/turbo/pro/text-to-video": {
      className: "KlingVideoV3TurboProTextToVideo",
      docstring:
        "Generate high quality 1080p videos using Kling's Turbo 3.0 model, with improved lipsync and multishot generation capabilities.",
      tags: ["generation", "text-to-video", "txt2vid", "kling", "turbo", "pro"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/kling-video/v3/turbo/standard/text-to-video": {
      className: "KlingVideoV3TurboStandardTextToVideo",
      docstring:
        "Kling 3.0 Turbo Standard is a fast, cost-efficient video generation model that turns text prompts directly into 720P video with native audio, optimized for rapid iteration and high-volume production",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "kling",
        "turbo",
        "standard"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-22b/distilled/text-to-video": {
      className: "Ltx2322bDistilledTextToVideo",
      docstring: "Generate video with audio from text using LTX-2.3 Distilled",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "ltx",
        "22b",
        "distilled"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-22b/distilled/text-to-video/lora": {
      className: "Ltx2322bDistilledTextToVideoLora",
      docstring:
        "Generate video with audio from text using LTX-2.3 Distilled and custom LoRA",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "ltx",
        "22b",
        "distilled",
        "lora"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-22b/text-to-video": {
      className: "Ltx2322bTextToVideo",
      docstring: "Generate video with audio from text using LTX-2.3",
      tags: ["generation", "text-to-video", "txt2vid", "ltx", "22b"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-22b/text-to-video/lora": {
      className: "Ltx2322bTextToVideoLora",
      docstring:
        "Generate video with audio from text using LTX-2.3 and custom LoRA",
      tags: ["generation", "text-to-video", "txt2vid", "ltx", "22b", "lora"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/text-to-video": {
      className: "Ltx23QualityTextToVideo",
      docstring:
        "Generate high-quality video with audio from text using LTX-2.3",
      tags: ["generation", "text-to-video", "txt2vid", "ltx", "quality"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3-quality/text-to-video/lora": {
      className: "Ltx23QualityTextToVideoLora",
      docstring:
        "Generate high-quality video with audio from text using LTX-2.3 and custom LoRA",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "ltx",
        "quality",
        "lora"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3/text-to-video": {
      className: "Ltx23TextToVideo",
      docstring:
        "LTX-2.3 is a high-quality, fast AI video model available in Pro and Fast variants for text-to-video, image-to-video, and audio-to-video.",
      tags: ["generation", "text-to-video", "txt2vid", "ltx"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/ltx-2.3/text-to-video/fast": {
      className: "Ltx23TextToVideoFast",
      docstring:
        "LTX-2.3 is a high-quality, fast AI video model available in Pro and Fast variants for text-to-video, image-to-video, and audio-to-video.",
      tags: ["generation", "text-to-video", "txt2vid", "ltx", "fast"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/pixverse/c1/text-to-video": {
      className: "PixverseC1TextToVideo",
      docstring:
        "Generate film-grade videos from text prompts with native audio, up to 1080p and 15 seconds, using PixVerse C1.",
      tags: ["generation", "text-to-video", "txt2vid", "pixverse", "c1"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/pixverse/v6/text-to-video": {
      className: "PixverseV6TextToVideo",
      docstring: "Pixverse's latest v6 Model.",
      tags: ["generation", "text-to-video", "txt2vid", "pixverse", "v6"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/veo3.1/lite": {
      className: "Veo31Lite",
      docstring:
        "Veo 3.1 Lite balances practical utility with professional capabilities, supporting Text-to-Video and Image-to-Video",
      tags: ["generation", "text-to-video", "txt2vid", "veo3"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/vidu/q3/text-to-video": {
      className: "ViduQ3TextToVideo",
      docstring: "Vidu's latest Q3 pro models",
      tags: ["generation", "text-to-video", "txt2vid", "vidu", "q3"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/vidu/q3/text-to-video/turbo": {
      className: "ViduQ3TextToVideoTurbo",
      docstring: "Vidu's Q3 Turbo Model.",
      tags: ["generation", "text-to-video", "txt2vid", "vidu", "q3", "turbo"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/wan/v2.7/text-to-video": {
      className: "WanV27TextToVideo",
      docstring:
        "Wan 2.7 is the latest generation AI video model, delivering enhanced motion smoothness, superior scene fidelity, and greater visual coherence.",
      tags: ["generation", "text-to-video", "txt2vid", "wan"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "google/gemini-omni-flash": {
      className: "GeminiOmniFlash",
      docstring:
        "Creates video with synchronized audio from text input. Grounded in Gemini's real-world knowledge, with improved physics understanding for more coherent motion and interaction.",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "google",
        "gemini",
        "omni",
        "flash"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "luma/agent/ray/v3.2/text-to-video": {
      className: "LumaAgentRayV32TextToVideo",
      docstring:
        "Luma Ray 3.2 generates cinematic video from a text prompt, with control over resolution, duration, and seamless looping, plus reference images to lock in subject and style.",
      tags: ["generation", "text-to-video", "txt2vid", "luma", "agent", "ray"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "xai/grok-imagine-video/text-to-video": {
      className: "GrokImagineVideoTextToVideo",
      docstring:
        "Generate videos with audio from text using Grok Imagine Video.",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "xai",
        "grok",
        "imagine"
      ],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },

    "alibaba/wan-3.0/text-to-video": {
      className: "Wan30TextToVideo",
      docstring:
        "Wan 3.0 generates video from a text prompt with smoother motion and stronger scene coherence than Wan 2.x.",
      tags: ["generation", "text-to-video", "txt2vid", "video", "wan", "wan-3"],
      useCases: [
        "Generate cinematic shots from a written prompt",
        "Produce social clips without filming",
        "Storyboard a scene as motion",
        "Iterate on shot ideas quickly",
        "Create B-roll for edits"
      ]
    },

    "alibaba/wan-3.0-prime/text-to-video": {
      className: "Wan30PrimeTextToVideo",
      docstring:
        "Wan 3.0 Prime generates video from text with faster turnaround than the base Wan 3.0 endpoint.",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "video",
        "wan",
        "wan-3",
        "fast"
      ],
      useCases: [
        "Iterate on shot ideas at speed",
        "Preview a prompt before a final render",
        "Generate short social videos in bulk",
        "Draft motion for a storyboard",
        "Explore several takes of one scene"
      ]
    },

    "bytedance/seedance-2.5/text-to-video": {
      className: "BytedanceSeedance25TextToVideo",
      docstring:
        "Seedance 2.5 generates a native 30-second single-shot video at up to 720p from one text prompt.",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "video",
        "seedance",
        "bytedance",
        "long-form"
      ],
      useCases: [
        "Generate a full 30-second shot in one pass",
        "Avoid stitching several short clips",
        "Produce single-take narrative video",
        "Create long social videos from a prompt",
        "Keep lighting consistent across a shot"
      ]
    },

    "lightricks/ltx-2.5/text-to-video/fast": {
      className: "Ltx25TextToVideoFast",
      docstring:
        "LTX 2.5 generates synchronized video and audio from text in a speed-optimized pass.",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "video",
        "ltx",
        "ltx-2-5",
        "audio",
        "fast"
      ],
      useCases: [
        "Preview a prompt before a final render",
        "Iterate on shots cheaply",
        "Generate video with matching audio",
        "Draft social clips at speed",
        "Explore several takes of one idea"
      ]
    },

    "lightricks/ltx-2.5/text-to-video/pro": {
      className: "Ltx25TextToVideoPro",
      docstring:
        "LTX 2.5 generates synchronized video and audio from text in a quality-optimized pass.",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "video",
        "ltx",
        "ltx-2-5",
        "audio",
        "quality"
      ],
      useCases: [
        "Render the final take of a shot",
        "Produce video with its own soundtrack",
        "Deliver high-fidelity generated footage",
        "Create ads with synchronized audio",
        "Finish a shot approved from a fast preview"
      ]
    },

    "minimax/h3/text-to-video/lora": {
      className: "MinimaxH3TextToVideoLora",
      docstring:
        "MiniMax H3 generates video with synchronized audio from text, with a trained LoRA applied at adjustable strength.",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "video",
        "minimax",
        "h3",
        "lora",
        "audio"
      ],
      useCases: [
        "Generate video in a fine-tuned style",
        "Keep a trained character consistent",
        "Apply a learned motion signature",
        "Blend a LoRA at partial strength",
        "Produce branded video with audio"
      ]
    },

    "mirage-api/avatar-x/text-to-video": {
      className: "AvatarXTextToVideo",
      docstring:
        "Avatar X generates a talking-head video from text with strong identity preservation and expressive delivery.",
      tags: [
        "generation",
        "text-to-video",
        "txt2vid",
        "video",
        "avatar",
        "lipsync",
        "talking-head",
        "mirage"
      ],
      useCases: [
        "Generate a presenter video from a script",
        "Produce training content without filming",
        "Localize a spokesperson video",
        "Create avatar-led product explainers",
        "Automate recurring video updates"
      ]
    }
  }
};
