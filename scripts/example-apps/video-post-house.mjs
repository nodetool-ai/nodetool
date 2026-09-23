const VIDEO = { $demo: "video" };
const MEDIA = "/app-preview/media/video-post-house";

export const VIDEO_POST_HOUSE_APP = {
  slug: "video-post-house",
  name: "AI Video Post House",
  emoji: "🎞️",
  featured: true,
  tagline: "One clip becomes a new look, a short cut, and an AI voiced performance.",
  description:
    "Upload a clip once. Restyle its picture with AI, grade the source, trim a teaser, and pull a cover still. If the clip has a visible presenter, voice a new script and sync the lips.",
  note: "The AI restyle and revoice use configured models and incur provider charges. Grading, trimming, and frame extraction run locally. Each result starts from the uploaded source; upload a result to make another pass.",
  workflows: {
    restyle: "Video Restyle Studio",
    revoice: "AI Spokesperson",
    grade: "Color Boost Video",
    teaser: "Trim a Clip",
    cover: "Pull a Still from a Clip"
  },
  variables: [
    { id: "sourceClip", name: "Source clip", scope: "instance", type: "video" }
  ],
  operations: [
    {
      id: "restyle",
      name: "AI restyle",
      workflow: "restyle",
      policy: "replace",
      timeoutMs: 900000,
      inputs: { source_video: { from: "variable", variableId: "sourceClip" } }
    },
    {
      id: "revoice",
      name: "AI revoice",
      workflow: "revoice",
      policy: "replace",
      timeoutMs: 900000,
      inputs: { presenter_clip: { from: "variable", variableId: "sourceClip" } }
    },
    {
      id: "grade",
      name: "Color grade",
      workflow: "grade",
      policy: "replace",
      inputs: { source_video: { from: "variable", variableId: "sourceClip" } }
    },
    {
      id: "teaser",
      name: "Teaser cut",
      workflow: "teaser",
      policy: "replace",
      inputs: { clip: { from: "variable", variableId: "sourceClip" } }
    },
    {
      id: "cover",
      name: "Cover still",
      workflow: "cover",
      policy: "replace",
      inputs: { clip: { from: "variable", variableId: "sourceClip" } }
    }
  ],
  sections: [
    {
      title: "Source and quick cuts",
      controls: [
        { video: "sourceClip", label: "Source clip", demo: `${MEDIA}/source.mp4` },
        { slider: "grading_intensity", op: "grade", label: "Color intensity", min: 0, max: 1, step: 0.05 },
        { run: ["grade"], label: "Grade the clip", disabledWhen: "grade" },
        { slider: { node: "op", prop: "start_time" }, op: "teaser", label: "Teaser starts at second", min: 0, max: 60, step: 0.25, default: 0 },
        { slider: { node: "op", prop: "end_time" }, op: "teaser", label: "Teaser ends at second", min: 1, max: 120, step: 0.25, default: 5 },
        { run: ["teaser"], label: "Cut a teaser", disabledWhen: "teaser" },
        { slider: { node: "frame", prop: "time" }, op: "cover", label: "Cover frame at second", min: 0, max: 30, step: 0.25, default: 2 },
        { run: ["cover"], label: "Pull a cover still", disabledWhen: "cover" }
      ],
      results: [
        { progress: "grade", label: "Grading frames…" },
        { error: "grade" },
        { show: "graded_video", op: "grade", as: "Video", label: "Color graded cut", demo: `${MEDIA}/graded.mp4` },
        { progress: "teaser", label: "Cutting the clip…" },
        { error: "teaser" },
        { show: "result", op: "teaser", as: "Video", label: "Teaser cut", demo: `${MEDIA}/teaser.mp4` },
        { progress: "cover", label: "Selecting frame…" },
        { error: "cover" },
        { show: "still", op: "cover", as: "Image", label: "Cover still", demo: `${MEDIA}/cover.jpg` }
      ]
    },
    {
      title: "AI picture treatment",
      controls: [
        { note: "Keep the camera move and timing. Change the visual style." },
        { model: { node: "restyle", prop: "model" }, op: "restyle", modelKind: "video_model", label: "Restyle model" },
        { text: "style", op: "restyle", label: "New visual style", multiline: true },
        { text: "preserve", op: "restyle", label: "Details to preserve", multiline: true },
        { slider: { node: "restyle", prop: "strength" }, op: "restyle", label: "Style strength", min: 0.2, max: 0.8, step: 0.05, default: 0.45 },
        { run: ["restyle"], label: "Restyle the clip", disabledWhen: "restyle" }
      ],
      results: [
        { progress: "restyle", label: "Repainting the footage…" },
        { activity: "restyle" },
        { error: "restyle" },
        { show: "restyled", op: "restyle", as: "Video", label: "Restyled cut", demo: VIDEO }
      ]
    },
    {
      title: "AI voiced performance",
      controls: [
        { note: "Use a clip with a visible presenter. The script becomes speech, then the picture is lip-synced." },
        { model: { node: "speech", prop: "model" }, op: "revoice", modelKind: "tts_model", label: "Voice model" },
        { model: { node: "sync", prop: "model" }, op: "revoice", modelKind: "video_model", label: "Lip-sync model" },
        { text: "script", op: "revoice", label: "New script", multiline: true },
        { run: ["revoice"], label: "Revoice the presenter", disabledWhen: "revoice" }
      ],
      results: [
        { progress: "revoice", label: "Voicing and syncing…" },
        { activity: "revoice" },
        { error: "revoice" },
        { show: "revoiced_clip", op: "revoice", as: "Video", label: "Revoiced performance", demo: VIDEO }
      ]
    }
  ]
};
