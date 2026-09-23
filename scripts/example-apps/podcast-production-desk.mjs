export const PODCAST_PRODUCTION_DESK_APP = {
  slug: "podcast-production-desk",
  name: "Podcast Production Desk",
  emoji: "🎙️",
  featured: true,
  tagline: "One recording becomes two audio treatments and a publishable content pack.",
  description:
    "A podcast workspace for cleaning or mastering a recording and making show notes, a newsletter, social posts, and quote cards from the same source.",
  note: "Audio cleanup and mastering run locally. The content pack uses configured transcription, writing, and image models. Download a treatment and upload it as the source to use it in another pass.",
  workflows: {
    clean: "Clean Up a Rough Voice Recording",
    master: "Master a Voice Track",
    publish: "Podcast Repurposing Studio"
  },
  variables: [
    { id: "sourceAudio", name: "Episode recording", scope: "instance", type: "audio" }
  ],
  operations: [
    {
      id: "clean",
      name: "Clean recording",
      workflow: "clean",
      policy: "replace",
      inputs: { audio: { from: "variable", variableId: "sourceAudio" } }
    },
    {
      id: "master",
      name: "Master episode",
      workflow: "master",
      policy: "replace",
      inputs: { audio: { from: "variable", variableId: "sourceAudio" } }
    },
    {
      id: "publish",
      name: "Make content pack",
      workflow: "publish",
      policy: "replace",
      timeoutMs: 900000,
      inputs: { episode_audio: { from: "variable", variableId: "sourceAudio" } }
    }
  ],
  sections: [
    {
      title: "Prepare the recording",
      controls: [
        { audio: "sourceAudio", label: "Episode audio" },
        { run: ["clean"], label: "Clean the recording", disabledWhen: "clean" },
        { run: ["master"], label: "Master the recording", disabledWhen: "master" }
      ],
      results: [
        { progress: "clean", label: "Removing room noise…" },
        { error: "clean" },
        { show: "cleaned", op: "clean", as: "Audio", label: "Cleaned recording", demo: { $demo: "audio" } },
        { progress: "master", label: "Balancing the voice…" },
        { error: "master" },
        { show: "mastered", op: "master", as: "Audio", label: "Mastered recording", demo: { $demo: "audio" } }
      ]
    },
    {
      title: "Make the content pack",
      controls: [
        { note: "Uses the episode audio uploaded above. Upload a cleaned or mastered download there to use it here." },
        { model: { node: "transcribe", prop: "model" }, op: "publish", modelKind: "asr_model", label: "Transcription model" },
        { model: { node: "shownotes_agent", prop: "model" }, op: "publish", modelKind: "language_model", label: "Show notes writer" },
        { model: { node: "newsletter_agent", prop: "model" }, op: "publish", modelKind: "language_model", label: "Newsletter writer" },
        { model: { node: "posts_list", prop: "model" }, op: "publish", modelKind: "language_model", label: "Social post writer" },
        { model: { node: "quotes_list", prop: "model" }, op: "publish", modelKind: "language_model", label: "Quote selector" },
        { model: { node: "quote_card", prop: "model" }, op: "publish", modelKind: "image_model", label: "Quote card image model" },
        { text: "show_context", op: "publish", label: "Show, audience, and call to action", multiline: true },
        { number: "quote_count", op: "publish", label: "Quote cards", min: 1, max: 8 },
        { run: ["publish"], label: "Create the content pack", disabledWhen: "publish" }
      ],
      results: [
        { progress: "publish", label: "Transcribing and drafting…" },
        { activity: "publish" },
        { error: "publish" },
        { show: "show_notes", op: "publish", as: "Markdown", label: "Episode notes", demo: "### Trailhead: Finding Your First Long Trail\nA practical guide to choosing a route, packing light, and staying flexible when weather changes." },
        { show: "newsletter", op: "publish", as: "Markdown", label: "Newsletter", demo: "**This week on Trailhead:** the small decisions that make a first long hike feel possible. Listen to the episode, then download the free gear checklist." },
        { show: "social_posts", op: "publish", as: "Markdown", label: "Social posts", demo: "1. Your first long trail starts with one good route, not a perfect pack.\n2. The gear you leave behind matters as much as what you bring." },
        { show: "quote_cards", op: "publish", as: "Image", label: "Quote cards", demo: { $demo: "image" } }
      ]
    }
  ]
};
