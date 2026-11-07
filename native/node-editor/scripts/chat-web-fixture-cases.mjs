// Inputs for generate-chat-web-fixtures.mjs. Catalogs named web-* repeat the
// node sets of the web ranking tests: utils/__tests__/nodeSearch.test.ts,
// utils/__tests__/nodeSearch.rankSearchNodes.test.ts and
// lib/tools/builtin/__tests__/searchNodes.test.ts. generated-<count> is the
// generateLargeDataset catalog of nodeSearch.test.ts.

const str = { type: "str", optional: false, type_args: [] };
const image = { type: "image", optional: false, type_args: [] };
const integer = { type: "int", optional: false, type_args: [] };
const any = { type: "any", optional: false, type_args: [] };
const node = (fields) => ({ description: "", properties: [], outputs: [], ...fields });

const catalogs = {
    "web-rank": [
        node({ title: "Image Resize", node_type: "image.Resize", namespace: "image" }),
        node({ title: "Text Concat", node_type: "text.Concat", namespace: "text" }),
        node({ title: "Image Blur", node_type: "image.Blur", namespace: "image" }),
        node({ title: "Math Add", node_type: "math.Add", namespace: "math" }),
        node({ title: "Add", node_type: "math.AddNumbers", namespace: "math" }),
        node({ title: "Subtract", node_type: "math.Subtract", namespace: "math" }),
        node({ title: "Alpha", node_type: "a.Alpha", namespace: "a" }),
        node({ title: "Alpha Two", node_type: "a.AlphaTwo", namespace: "a" }),
        node({ title: "A", node_type: "ns.A", namespace: "ns" }),
        node({ title: "B", node_type: "ns.B", namespace: "ns" })
    ],
    "web-search": [
        node({ namespace: "math", node_type: "math.add", title: "Add", description: "Adds two numbers together" }),
        node({ namespace: "math", node_type: "math.subtract", title: "Subtract", description: "Subtracts one number from another" }),
        node({ namespace: "string", node_type: "string.concat", title: "Concatenate", description: "Joins strings together" }),
        node({ namespace: "default", node_type: "default.node", title: "Default Node", description: "A default node that should be filtered out" })
    ],
    "web-tool": [
        node({ node_type: "huggingface.image.Generate", title: "HF Generate", namespace: "huggingface.image" }),
        node({ node_type: "nodetool.image.Generate", title: "NT Generate", namespace: "nodetool.image" }),
        node({ node_type: "fal.image.Generate", title: "Fal Generate", namespace: "fal.image" }),
        node({ node_type: "nodetool.text.Concat", title: "Concat", namespace: "nodetool.text" }),
        node({
            node_type: "nodetool.text.Format", title: "Format", namespace: "nodetool.text",
            properties: [{ name: "template", type: { type: "str" }, required: true }]
        }),
        node({
            node_type: "nodetool.constant.String", title: "String", namespace: "nodetool.constant",
            description: "Long description that should not be included.",
            properties: [{ name: "value", type: { type: "str" }, title: "Value", required: false, default: "", description: "Property description that should not be included." }],
            outputs: [{ name: "output", type: { type: "str" }, stream: false }]
        }),
        ...Array.from({ length: 10 }, (_, i) => node({ node_type: "nodetool.test.Node" + i, title: "Node " + i, namespace: "nodetool.test" }))
    ],
    catalog: [
        node({
            node_type: "nodetool.text.Concat", title: "Concat", namespace: "nodetool.text",
            description: "Concatenates two text values.\ntext, concat, join, combine\n\nUse cases:\n- Join prompt fragments\n- Build file names",
            properties: [{ name: "a", type: str, required: true }, { name: "b", type: str }],
            outputs: [{ name: "output", type: str }]
        }),
        node({
            node_type: "nodetool.text.FormatText", title: "Format Text", namespace: "nodetool.text",
            description: "Replaces placeholders in a template.\ntext, template, format\n\nUse cases:\nFill a prompt template from inputs",
            properties: [{ name: "template", type: str, required: true }],
            outputs: [{ name: "output", type: str }]
        }),
        node({
            node_type: "nodetool.text.RegexReplace", title: "Regex Replace", namespace: "nodetool.text",
            description: "Replaces text that matches a regular expression.\ntext, regex, replace, substitute",
            properties: [{ name: "text", type: str }, { name: "pattern", type: str }],
            outputs: [{ name: "output", type: str }]
        }),
        node({
            node_type: "nodetool.constant.String", title: "String", namespace: "nodetool.constant",
            description: "A constant string.\nconstant, text, string",
            properties: [{ name: "value", type: str }],
            outputs: [{ name: "output", type: str }]
        }),
        node({
            node_type: "nodetool.constant.Image", title: "Image", namespace: "nodetool.constant",
            description: "A constant image.\nconstant, image, picture",
            properties: [{ name: "value", type: image }],
            outputs: [{ name: "output", type: image }]
        }),
        node({
            node_type: "nodetool.image.TextToImage", title: "Text To Image", namespace: "nodetool.image",
            description: "Generates an image from a text prompt with any provider.\nimage, generation, text-to-image, txt2img\n\nUse cases:\n- Create artwork from a prompt\n- Draft product shots",
            properties: [{ name: "prompt", type: str, required: true }, { name: "width", type: integer }],
            outputs: [{ name: "output", type: image }]
        }),
        node({
            node_type: "nodetool.image.ImageToImage", title: "Image To Image", namespace: "nodetool.image",
            description: "Transforms an image guided by a prompt.\nimage, edit, img2img",
            properties: [{ name: "image", type: image, required: true }, { name: "prompt", type: str }],
            outputs: [{ name: "output", type: image }]
        }),
        node({
            node_type: "nodetool.image.Resize", title: "Resize", namespace: "nodetool.image",
            description: "Resizes an image to the given size.\nimage, resize, scale",
            properties: [{ name: "image", type: image }, { name: "width", type: integer }, { name: "height", type: integer }],
            outputs: [{ name: "output", type: image }]
        }),
        node({
            node_type: "nodetool.image.OldResize", title: "Resize (legacy)", namespace: "nodetool.image", deprecated: true,
            description: "Resizes an image.\nimage, resize",
            properties: [{ name: "image", type: image }],
            outputs: [{ name: "output", type: image }]
        }),
        node({
            node_type: "nodetool.video.TextToVideo", title: "Text To Video", namespace: "nodetool.video",
            description: "Generates a video clip from a text prompt.\nvideo, generation, text-to-video",
            properties: [{ name: "prompt", type: str, required: true }],
            outputs: [{ name: "output", type: { type: "video", optional: false, type_args: [] } }]
        }),
        node({
            node_type: "nodetool.audio.TextToSpeech", title: "Text To Speech", namespace: "nodetool.audio",
            description: "Reads text aloud with a speech model.\naudio, speech, tts, voice",
            properties: [{ name: "text", type: str, required: true }],
            outputs: [{ name: "output", type: { type: "audio", optional: false, type_args: [] } }]
        }),
        node({
            node_type: "nodetool.agents.Agent", title: "Agent", namespace: "nodetool.agents",
            description: "Runs a language model agent with tools.\nagent, llm, tools, chat",
            properties: [{ name: "prompt", type: str }, { name: "tools", type: { type: "list", optional: false, type_args: [any] } }],
            outputs: [{ name: "text", type: str }, { name: "chunk", type: { type: "chunk", optional: false, type_args: [] }, stream: true }]
        }),
        node({
            node_type: "nodetool.code.Code", title: "Code", namespace: "nodetool.code",
            description: "Runs JavaScript on its inputs.\ncode, javascript, script",
            properties: [{ name: "code", type: str }],
            outputs: []
        }),
        node({
            node_type: "nodetool.input.StringInput", title: "String Input", namespace: "nodetool.input",
            description: "A text value supplied when the workflow runs.\ninput, text, parameter",
            properties: [{ name: "value", type: str }],
            outputs: [{ name: "output", type: str }]
        }),
        node({
            node_type: "nodetool.list.Map", title: "Map", namespace: "nodetool.list",
            description: "Applies a value to each list item.\nlist, map, iterate",
            properties: [{ name: "values", type: { type: "list", optional: false, type_args: [str] } }],
            outputs: [{ name: "output", type: { type: "list", optional: false, type_args: [any] } }]
        }),
        node({
            node_type: "nodetool.math.Add", title: "Add", namespace: "nodetool.math",
            description: "Adds two numbers.\nmath, add, sum, plus",
            properties: [{ name: "a", type: { type: "union", optional: false, type_args: [integer, { type: "float", optional: false, type_args: [] }] } }, { name: "b", type: integer }],
            outputs: [{ name: "output", type: { type: "float", optional: false, type_args: [] } }]
        }),
        node({
            node_type: "nodetool.text.Choice", title: "Choice", namespace: "nodetool.text",
            description: "Picks one of a set of options.\nenum, choice, select",
            properties: [{ name: "option", type: { type: "enum", optional: false, type_args: [], type_name: "Mode", values: ["a", "b"] } }],
            outputs: [{ name: "output", type: str }]
        }),
        node({
            node_type: "nodetool.internal.Step", title: "Internal Step", namespace: "nodetool.internal", hidden: true,
            description: "An internal text step.\ntext, internal",
            properties: [{ name: "text", type: str }],
            outputs: [{ name: "output", type: str }]
        }),
        node({
            node_type: "huggingface.image.StableDiffusion", title: "Stable Diffusion", namespace: "huggingface.image",
            description: "Generates images with Stable Diffusion.\nimage, generation, diffusion, text-to-image",
            properties: [{ name: "prompt", type: str }],
            outputs: [{ name: "output", type: image }]
        }),
        node({
            node_type: "huggingface.text.TextGeneration", title: "Text Generation", namespace: "huggingface.text",
            description: "Generates text with a local model.\ntext, generation, llm",
            properties: [{ name: "prompt", type: str }],
            outputs: [{ name: "output", type: str }]
        }),
        node({
            node_type: "fal.image.FluxDev", title: "Flux Dev", namespace: "fal.image",
            description: "Generates images with FLUX.1 dev.\nimage, generation, flux",
            properties: [{ name: "prompt", type: str }],
            outputs: [{ name: "output", type: image }]
        }),
        node({
            node_type: "openai.image.CreateImage", title: "Create Image", namespace: "openai.image",
            description: "Creates an image with an OpenAI model.\nimage, generation, openai",
            properties: [{ name: "prompt", type: str }],
            outputs: [{ name: "output", type: image }]
        }),
        node({
            node_type: "replicate.DynamicReplicate", title: "Replicate", namespace: "replicate",
            description: "Runs any Replicate model.\nreplicate, model, dynamic",
            properties: [{ name: "model", type: str }],
            outputs: [{ name: "output", type: any }]
        }),
        node({
            node_type: "lib.pillow.Enhance", title: "Enhance", namespace: "lib.pillow",
            description: "Adjusts image contrast and sharpness.\nimage, enhance, adjust",
            properties: [{ name: "image", type: image }],
            outputs: [{ name: "output", type: image }]
        }),
        node({
            node_type: "default.Placeholder", title: "Placeholder", namespace: "default",
            description: "A default namespace node.\nimage, text",
            properties: [],
            outputs: []
        })
    ]
};

const query = (catalog, args) => ({ catalog, args });
const searchCases = [
    // nodeSearch.rankSearchNodes.test.ts
    query("web-rank", { query: "image" }),
    query("web-rank", { query: "zzzzzzzzzzzzzzz" }),
    query("web-rank", { query: "math" }),
    query("web-rank", { query: "math.Add" }),
    query("web-rank", { query: "alpha" }),
    query("web-rank", { query: "", limit: 100 }),
    // nodeSearch.test.ts
    query("web-search", { query: "", limit: 100 }),
    query("web-search", { query: "Add" }),
    query("web-search", { query: "math" }),
    query("web-search", { query: "+" }),
    query("web-search", { query: "string", input_type: "string" }),
    query("web-search", { query: "", input_type: "string", output_type: "string", strict_match: true }),
    query("generated-500", { query: "add" }),
    query("generated-2000", { query: "process" }),
    query("generated-1000", { query: "test" }),
    query("generated-1000", { query: "add" }),
    query("generated-1000", { query: "sub" }),
    query("generated-1000", { query: "mul" }),
    query("generated-1000", { query: "div" }),
    query("generated-1000", { query: "proc" }),
    // searchNodes.test.ts and searchNodesTool.test.ts
    query("web-tool", { query: "concat" }),
    query("web-tool", { query: "format", include_properties: true }),
    query("web-tool", { query: "node", limit: 3 }),
    query("web-tool", { query: "generate" }),
    query("web-tool", { query: "nonexistent" }),
    query("web-tool", { query: "string", include_properties: "true", include_outputs: "true", strict_match: "false" }),
    // Ranking tiers over catalog descriptions with tags and use cases.
    query("catalog", { query: "image" }),
    query("catalog", { query: "text to image" }),
    query("catalog", { query: "txt2img" }),
    query("catalog", { query: "imgae" }),
    query("catalog", { query: "resize image", include_properties: true, include_outputs: true }),
    query("catalog", { query: "nodetool.text" }),
    query("catalog", { query: "flux" }),
    query("catalog", { query: "speech" }),
    query("catalog", { query: "  Concat  " }),
    query("catalog", { query: "prompt fragments" }),
    query("catalog", { query: "rgx" }),
    query("catalog", { query: "generation", limit: 4 }),
    query("catalog", { query: "", limit: 100 }),
    query("catalog", { query: "", input_type: "str" }),
    query("catalog", { query: "", output_type: "image" }),
    query("catalog", { query: "text", input_type: "str", output_type: "str" }),
    query("catalog", { query: "", input_type: "any", limit: 100 }),
    query("catalog", { query: "", input_type: "int", strict_match: true }),
    query("catalog", { query: "", output_type: "notype", strict_match: true }),
    query("catalog", { query: "", input_type: "enum" }),
    query("catalog", { query: "list", input_type: "str" })
];

const payloadContext = {
    threadId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    workflowId: "workflow-chat",
    workflowTitle: "Chat fixture"
};
const model = (provider, id) => ({ provider, id, name: id });
const assets = [
    { id: "c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1", name: "photo.png", content_type: "image/png" },
    { id: "c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2", name: "brief", content_type: "application/pdf" },
    { id: "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3", name: "notes.bin", content_type: "application/octet-stream" },
    { id: "c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4", name: "voice", content_type: "audio/wav" },
    { id: "c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5", name: "clip.MOV", content_type: "video/quicktime" }
];
const payloadCases = [
    { name: "chat", mode: "chat", prompt: "Edit this workflow", chatModel: model("openai", "gpt-5") },
    { name: "chat-selection", mode: "chat", prompt: "Explain the selection", chatModel: model("openai", "gpt-5"), selection: ["node-chat"] },
    { name: "chat-reasoning", mode: "chat", prompt: "Plan the graph", chatModel: model("anthropic", "claude-opus-4-6"), reasoning: "high" },
    { name: "chat-reasoning-kept", mode: "chat", prompt: "Still reasoning", chatModel: model("openai", "gpt-4o"), reasoning: "low" },
    { name: "chat-attachments", mode: "chat", prompt: "", chatModel: model("openai", "gpt-5"), attachments: assets },
    {
        name: "image", mode: "image", prompt: "A lighthouse at dusk", chatModel: model("openai", "gpt-5"), reasoning: "high",
        settings: { image: { model: { type: "image_model", ...model("fal", "fal-ai/flux/dev") }, aspectRatio: "1:1", resolution: "2K", variations: 2 } }
    },
    {
        name: "image-defaults", mode: "image", prompt: "Wide landscape", chatModel: model("openai", "gpt-5"),
        settings: { image: { model: { type: "image_model", ...model("openai", "gpt-image-1") } } }
    },
    {
        name: "image-edit", mode: "image_edit", prompt: "Make it night", chatModel: model("openai", "gpt-5"), attachments: [assets[0]],
        settings: { imageEdit: { model: { type: "image_model", ...model("fal", "fal-ai/flux/dev/image-to-image") }, strength: 0.85, numInferenceSteps: 40 } }
    },
    {
        name: "video", mode: "video", prompt: "Waves on rocks",
        settings: { video: { model: { type: "video_model", ...model("fal", "fal-ai/veo3") }, duration: 5, resolution: "720p", aspectRatio: "9:16" } }
    },
    {
        name: "image-to-video", mode: "image_to_video", prompt: "Animate the photo", attachments: [assets[0]],
        settings: { imageToVideo: { model: { type: "video_model", ...model("fal", "fal-ai/kling/image-to-video") } } }
    },
    {
        name: "reference-to-video", mode: "reference_to_video", prompt: "Same character walking",
        settings: { referenceToVideo: { model: { type: "video_model", ...model("fal", "fal-ai/vidu/reference") }, useReferenceVideoAudio: true } }
    },
    {
        name: "retake", mode: "retake", prompt: "Make it rain", attachments: [assets[4]],
        settings: { retake: { model: { type: "video_model", ...model("fal", "fal-ai/retake") } } }
    },
    {
        name: "extend", mode: "extend", prompt: "Continue the shot", attachments: [assets[4]],
        settings: { extend: { model: { type: "video_model", ...model("fal", "fal-ai/extend") }, direction: "start", duration: 5 } }
    },
    {
        name: "audio", mode: "audio", prompt: "Welcome to the studio",
        settings: { audio: { model: { type: "tts_model", ...model("openai", "gpt-4o-mini-tts") }, voice: "nova", speed: 1.25, format: "wav" } }
    },
    {
        name: "music", mode: "music", prompt: "Calm piano",
        settings: { music: { model: { type: "music_model", ...model("elevenlabs", "music_v1") }, duration: 60 } }
    }
];

export const CHAT_FIXTURES = {
    nativeTools: [
        "ui_get_graph", "ui_add_node", "ui_connect_nodes", "ui_move_node", "ui_set_node_title",
        "ui_delete_node", "ui_delete_edge", "ui_update_node_data", "ui_search_nodes", "ui_search_models",
        "ui_switch_tab", "ui_copy", "ui_paste", "ui_open_workflow", "ui_run_workflow", "ui_open_document"
    ],
    catalogs,
    searchCases,
    payloadContext,
    payloadCases
};
