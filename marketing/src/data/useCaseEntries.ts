import type { QaPair } from "../lib/jsonld";

/**
 * The three `/use-cases/*` pages, in the parts two files need to agree on.
 *
 * The steps render on the page as "How it works" and become the page's `HowTo`
 * schema in its layout; the FAQ renders at the bottom and becomes the page's
 * `FAQPage` schema. Both live here so the structured data can only ever repeat
 * what the visitor reads.
 */

export type UseCaseStep = {
  /** Step heading on the page, and the `HowToStep` name. */
  title: string;
  body: string;
  /** The concrete example under the step — page-only, not schema. */
  detail: string;
};

export type UseCaseEntry = {
  slug: string;
  route: string;
  /** The `HowTo` name — phrased as the task, not the page title. */
  howToName: string;
  howToDescription: string;
  /** Models named on the page, carried into the schema as `HowToTool`. */
  tools: string[];
  steps: UseCaseStep[];
  faq: QaPair[];
};

export const moviePosterUseCase: UseCaseEntry = {
  slug: "movie-poster",
  route: "/use-cases/movie-poster",
  howToName: "How to generate movie posters with AI in NodeTool",
  howToDescription:
    "Turn a title, a genre, and an audience into a creative strategy, a batch of plot concepts, and a set of cinematic movie posters on one canvas.",
  tools: ["NodeTool", "Gemini 3.1 Pro Preview", "GPT Image-2"],
  steps: [
    {
      title: "Set the brief",
      body: "Three text inputs hold the film's title, its genre, and the audience you're selling to. That's the entire creative input.",
      detail: "Singularity · Sci-Fi · AI Enthusiasts",
    },
    {
      title: "Write the strategy",
      body: "A Prompt node frames the brief and an agent returns a real creative strategy: positioning, audience insight, a core visual concept, and a color palette.",
      detail: "Positioning · audience insight · hex palette",
    },
    {
      title: "Spin up concepts",
      body: "A list generator turns the strategy into a batch of distinct plot angles, so one run gives you a spread of directions, not a single guess.",
      detail: "Five plot concepts per run",
    },
    {
      title: "Render the key art",
      body: "Each concept is templated into a full theatrical poster prompt, then an image model renders it, title, tagline, billing block and all.",
      detail: "GPT Image-2 · 2K · authentic Hollywood layout",
    },
  ],
  faq: [
    {
      question: "How do you generate a movie poster with AI?",
      answer:
        "In NodeTool it takes four nodes: enter the title, genre, and audience; an agent writes the creative strategy; a list generator turns it into distinct plot concepts; an image model renders each concept as a full theatrical poster, title, tagline, and billing block included.",
    },
    {
      question: "Which models does this workflow use?",
      answer:
        "Gemini 3.1 Pro Preview writes the strategy and the plot concepts, and GPT Image-2 renders the key art. Both are called with your own provider keys at provider prices.",
    },
    {
      question: "Can I swap in a different image model?",
      answer:
        "Yes. GPT Image-2, Flux, Nano Banana, and Ideogram are one node apart — change the model and the whole batch re-renders in the new look, with the rest of the workflow untouched.",
    },
    {
      question: "Do I need a designer or Photoshop?",
      answer:
        "No. The poster Prompt node owns the composition, typography, and billing-block layout, so each run produces finished poster concepts. Drop in a new title and run it again — the workflow is the reusable part.",
    },
  ],
};

export const movieTrailerUseCase: UseCaseEntry = {
  slug: "movie-trailer",
  route: "/use-cases/movie-trailer",
  howToName: "How to generate a movie trailer with AI in NodeTool",
  howToDescription:
    "Turn one logline into a storyboard, a still on every card, animated clips, and a finished cut on the timeline.",
  tools: [
    "NodeTool",
    "Gemini 3.1 Pro Preview",
    "GPT Image-2",
    "Veo 3.1 Preview",
  ],
  steps: [
    {
      title: "Write the logline",
      body: "One line about the film, the look you want, and how many shots. That is the whole brief.",
      detail:
        "A getaway driver outruns a collapsing bridge · gritty daylight · 6 shots",
    },
    {
      title: "Direct the storyboard",
      body: "Press Direct and the board fills with cards — one beat per card, with its action, camera, and motion, all under the look you asked for.",
      detail: "6 cards · framing, lens, angle, movement · one style bible",
    },
    {
      title: "Approve the stills",
      body: "Every card renders a still first. Stills cost cents, so re-roll a card until it looks right — the rest of the board stays put.",
      detail: "Cinematic 16:9 key art · re-roll one card at a time",
    },
    {
      title: "Animate and cut",
      body: "Animate only the cards you approved, then send the board to the timeline: the clips arrive in shot order, ready to trim, score, and export.",
      detail: "Image-to-video · clips in shot order · export an MP4",
    },
  ],
  faq: [
    {
      question: "How do you make a movie trailer with AI?",
      answer:
        "Write a logline, a visual style, and a shot count. NodeTool's storyboard turns that into a card per shot with action and camera notes, renders a still on each card, animates the ones you approve into clips, and sends the board to the timeline where you trim, score, and export the cut.",
    },
    {
      question: "Which models does this use?",
      answer:
        "Gemini 3.1 Pro Preview directs the board, GPT Image-2 renders each card's still, and Veo 3.1 Preview animates the approved stills into clips. All three run on your own provider keys.",
    },
    {
      question: "Can I use a different video model?",
      answer:
        "Yes. Veo, Seedance, Kling, and Runway are a dropdown apart, and you can change it for a single shot. Your board, your stills, and the clips you already approved stay as they are.",
    },
    {
      question: "Do I need a video editor to cut the trailer?",
      answer:
        "No. The timeline is built in. The approved clips land on a track in shot order, and you trim, reorder, lay music and voice underneath, and export a finished video without leaving NodeTool.",
    },
  ],
};

export const productVideoUseCase: UseCaseEntry = {
  slug: "product-video",
  route: "/use-cases/product-video",
  howToName: "How to generate a product video from one photo in NodeTool",
  howToDescription:
    "Turn a campaign brief and a single product photo into a cinematic 16:9 product video on one canvas.",
  tools: ["NodeTool", "Gemini 3.1 Pro Preview", "Veo 3.1 Preview"],
  steps: [
    {
      title: "Feed in the campaign",
      body: "Three text inputs hold the brief, the target audience, and the key features. A product photo goes in alongside them as the hero shot.",
      detail:
        "Aurora Trail smart fitness watch · active millennials who hike · GPS, heart-rate, adaptive coaching, water resistance",
    },
    {
      title: "Assemble the prompt",
      body: "A Prompt node templates those inputs into a precise, rule-based request: one camera move, one subject action, lighting, color anchors, and hard constraints.",
      detail: "No on-screen text, no logos, no watermarks, no distorted anatomy",
    },
    {
      title: "Direct the shot",
      body: "An agent turns the request into a concrete, cinematic prompt with framing, lens, and motion cues, the part most people get wrong by hand.",
      detail:
        "Gemini 3.1 Pro · 50mm macro push over the watch on a wet river rock at dawn",
    },
    {
      title: "Render the video",
      body: "A text-to-video model animates the product photo from the agent's prompt into a finished, ready-to-post clip.",
      detail: "Veo 3.1 · 16:9 · 720p · 8 seconds · rendered in ~44s",
    },
  ],
  faq: [
    {
      question: "How do you make a product video from a single photo?",
      answer:
        "Give the workflow a brief, an audience, the key features, and one product photo. A Prompt node turns them into a rule-based request, an agent writes the cinematic shot direction, and a video model animates the photo into a finished 16:9 clip.",
    },
    {
      question: "Which models does this workflow use?",
      answer:
        "Gemini 3.1 Pro Preview writes the video prompt and Veo 3.1 Preview renders the clip from the product photo. Both are called with your own keys at provider prices.",
    },
    {
      question: "How long is the finished clip?",
      answer:
        "The shipped setup renders an 8-second 16:9 clip at 720p, which took about 44 seconds in the run shown on this page. Change the video node and you change the length, resolution, and model.",
    },
    {
      question: "Can I run it for a whole product line?",
      answer:
        "Yes. The workflow is the reusable part: swap the photo and the brief and run it again for the next product, with the same prompt rules and the same look.",
    },
  ],
};

export const useCaseEntries: UseCaseEntry[] = [
  moviePosterUseCase,
  movieTrailerUseCase,
  productVideoUseCase,
];
