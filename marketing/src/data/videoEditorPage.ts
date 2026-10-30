import type { QaPair } from "@/lib/jsonld";

/**
 * Copy for /ai-video-editor, shared by the page and its Markdown mirror
 * (scripts/generate-llms-txt.mjs).
 *
 * Every claim here was checked against the product: timeline features in
 * docs/video-editor.md and packages/timeline/src/types.ts, storyboard flow in
 * docs/storyboard-editor.md, export formats in
 * web/src/components/timeline/ExportVideoDialog.tsx and
 * packages/video-nodes/src/nodes/timeline/outputFormats.ts, agent tools in
 * packages/agents/src/tools/builtin-tools.ts and mcp-tools.ts. Change this file
 * when those change.
 */

export const VIDEO_TITLE = "Open-Source AI Video Editor with an Editable Timeline | NodeTool";
export const VIDEO_DESCRIPTION =
  "An agent writes the script, plans the shots, generates them on Veo, Kling, or Seedance, and cuts a multi-track timeline you keep editing. Open source.";

export const VIDEO_LEAD =
  "NodeTool is an open-source AI video editor where the agent's work stays editable. The agent plans a storyboard, renders each shot on the video model you pick, voices the script, and assembles a multi-track timeline. You open that timeline, swap a take, trim a cut, or regenerate one shot without rendering the rest. Use the built-in agent, or connect Claude Code or Codex over MCP.";

export type FlowStep = { title: string; body: string };

export const FLOW_STEPS: FlowStep[] = [
  {
    title: "Plan the shots",
    body: "A storyboard holds the scenes and shots, each with its camera, prompt, and duration. The agent can write it from a brief or a script, and you can edit any shot on the board.",
  },
  {
    title: "Keep characters consistent",
    body: "Entities hold a character, location, style, or product with a reference image and a fixed description. Cast them on the board, and every shot that uses them gets the same reference.",
  },
  {
    title: "Render stills, then clips",
    body: "Render a still per shot, pick the best take, then animate it on an image-to-video model or render straight from the prompt. Each render keeps its takes, so a better earlier take is one click away.",
  },
  {
    title: "Voice the script",
    body: "A script holds the lines and voices. Voice all lines, and a line you change is marked stale so only that line is voiced again.",
  },
  {
    title: "Cut the timeline",
    body: "Create timeline turns the board and the voiced script into a multi-track sequence. From there it is an ordinary edit: trims, transitions, titles, captions, music, and keyframes.",
  },
  {
    title: "Deliver every format",
    body: "Adapt format makes 9:16, 1:1, and 4:5 versions of the sequence in one step. Export MP4, WebM, or a PNG sequence, or hand the cut to Premiere Pro.",
  },
];

export const TIMELINE_FEATURES: string[] = [
  "Video, audio, overlay, subtitle, and MIDI tracks.",
  "Image, video, audio, text, shape, 3D model, group, and adjustment clips.",
  "Trim, split, ripple and roll edits, three drop modes, snapping, markers, and J/K/L shuttle. Keyboard layouts for NodeTool, Premiere Pro, and Final Cut Pro.",
  "12 transitions, including crossfade, wipe, push, zoom, whip, glitch, iris, and light leak.",
  "Text and caption styles, subtitle tracks, motion presets, keyframes, speed, and time remapping.",
  "Clip effects such as color, blur, glow, chroma key, curves, LUT, and grain, plus audio gain, EQ, and compression.",
  "Generated clips stay bound to the workflow that made them. Change a setting and only that clip is flagged for regeneration, with its earlier versions kept.",
];

export const AGENT_TOOLS: { name: string; body: string }[] = [
  { name: "create_storyboard, edit_storyboard", body: "Write and revise the board: scenes, shots, camera, style, and cast." },
  { name: "render_storyboard_stills, render_storyboard_clips", body: "Render the shots that still need it, or only the stale ones, on the model you name." },
  { name: "voice_script_lines", body: "Voice every draft or stale line, each with its own voice." },
  { name: "assemble_storyboard_timeline", body: "Turn rendered clips into a saved timeline." },
  { name: "edit_timeline", body: "Change clips, tracks, text, effects, and timing in one checked edit." },
  { name: "preview_timeline_frame", body: "Render frames of the composited cut so the agent can look at the result." },
  { name: "render_timeline", body: "Render the finished sequence to MP4, WebM, ProRes MOV, or a PNG sequence." },
];

export const EXPORT_ROWS: { target: string; detail: string }[] = [
  { target: "Browser export", detail: "MP4 (H.264), WebM (VP9 with optional alpha), or a PNG sequence, encoded in the browser with WebCodecs. MP4 needs a browser that can encode H.264." },
  { target: "Server render", detail: "MP4, WebM, MOV (ProRes), or a PNG sequence, from the editor or with render_timeline." },
  { target: "Premiere Pro", detail: "An FCP7 XML file with the media. Text, shapes, captions, effects, animations, transitions, and fades do not carry over." },
  { target: "Project files", detail: "Export the timeline as a project zip, or the whole project as one .nodetool-project file." },
];

export const VIDEO_LIMITS: string[] = [
  "Final Cut Pro (FCPXML) and DaVinci Resolve export are not available. Premiere Pro export drops text, effects, and transitions.",
  "The guided Video and Storyboard flows do not make on-camera speech. Lip-synced dialogue needs the agent, a character entity, a source face video, and a model that supports lip sync.",
  "Smart Reframe in Adapt format needs a subject track or authored framing for every visual clip.",
  "Without WebGPU the preview skips chroma key, vignette, and sharpen.",
  "Generation runs on your own provider accounts, so render costs are the provider's prices. NodeTool shows estimates on render buttons.",
];

export const VIDEO_LIMITS_SUMMARY =
  "NodeTool is built for short films, ads, trailers, and explainers made from generated shots. For long-form editing and finishing, export the cut to Premiere Pro or work in a dedicated editor.";

export const VIDEO_FAQ: QaPair[] = [
  {
    question: "Is there an AI video editor that keeps the project editable?",
    answer:
      "Yes. In NodeTool the agent's storyboard, script, and timeline are the same documents you open and edit. Swap a take, trim a clip, change a line, or regenerate one shot, and the rest of the edit stays as it was.",
  },
  {
    question: "Can Claude Code edit a video timeline?",
    answer:
      "Yes. Run npx -y --package=@nodetool-ai/cli-mcp nodetool-mcp install to add NodeTool as an MCP server. Claude Code can then create storyboards, render shots, voice a script, edit the timeline with edit_timeline, look at frames with preview_timeline_frame, and render the cut with render_timeline. The timeline opens in Studio like any other.",
  },
  {
    question: "Which video models does it support?",
    answer:
      "Veo, Kling, Seedance, Sora, Hailuo, Wan, and others, through providers such as fal, Replicate, and KIE on your own keys. You pick the model per board or per shot, and you can switch models without changing tools.",
  },
  {
    question: "How do I keep the same character across shots?",
    answer:
      "Create a character entity with a reference image and a description, then cast it on the storyboard. Every shot that uses the character gets the same description, and models that accept reference images get the image too.",
  },
  {
    question: "Can I change one shot without regenerating the whole video?",
    answer:
      "Yes. Each shot renders on its own and keeps its takes. Regenerate or revise one shot, choose the take you want, and the timeline uses it. A changed workflow setting flags only the clips it affects.",
  },
  {
    question: "Is it free and open source?",
    answer:
      "NodeTool Studio is free and open source under AGPL-3.0, and runs on macOS, Windows, and Linux. Video generation calls the providers you connect, and they bill you at their own prices.",
  },
  {
    question: "Does it replace Premiere Pro or DaVinci Resolve?",
    answer:
      "No. NodeTool covers generation, assembly, and a capable multi-track edit for short pieces. For long-form editing, grading, and finishing, export the cut to Premiere Pro.",
  },
];

export const VIDEO_LINKS: { label: string; href: string }[] = [
  { label: "Storyboards made in NodeTool", href: "/storyboards" },
  { label: "AI image editor", href: "/ai-image-editor" },
  { label: "Recipe: storyboard to trailer", href: "/recipes/storyboard-to-trailer" },
  { label: "Video Editor guide", href: "https://docs.nodetool.ai/video-editor" },
  { label: "Storyboard Editor guide", href: "https://docs.nodetool.ai/storyboard-editor" },
  { label: "MCP server for Claude Code and Codex", href: "/mcp" },
  { label: "NodeTool compared with Runway", href: "/alternatives/runway" },
];
