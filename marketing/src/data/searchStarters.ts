export const searchStarters = {
  "movie-trailer-generator": {
    name: "Movie Trailer Generator",
    route: "/templates/movie-trailer-generator",
    summary: "Follow a logline through shot planning, keyframes, video generation, and a joined trailer. Change the brief or any model in the graph.",
    providers: "Gemini and KIE API keys. The shipped graph uses Gemini for direction and Veo video, and KIE for GPT Image-2 keyframes. Each shot incurs image and video generation charges.",
    steps: [
      "In Studio, open Movie Trailer Generator from the template library.",
      "Connect Gemini and KIE in provider settings and review the selected models.",
      "Enter a Logline and Visual Style. Set Shot Count to 1 for a first paid test instead of the template's six-shot default.",
      "Run the workflow and inspect the trailer output. Save the graph before changing the brief or adding shots.",
    ],
  },
  "generate-then-upscale-a-poster": {
    name: "Generate then Upscale a Poster",
    route: "/templates/generate-then-upscale-a-poster",
    summary: "Follow a prompt through image generation and upscaling. Keep the graph open to inspect or change either model.",
    providers: "A FAL API key. The shipped graph uses FLUX.1 Schnell and Clarity Upscaler.",
    steps: [
      "In Studio, open Generate then Upscale a Poster from the template library.",
      "Connect FAL in provider settings. Hosted generation and upscaling are billed by FAL.",
      "Change the Prompt node, then run the workflow. Inspect the draft and the final Poster output.",
      "Save the workflow. Change the prompt or image model and run it again.",
    ],
  },
  "write-the-prompt-then-make-the-image": {
    name: "Write the Prompt, Then Make the Image",
    route: "/templates/write-the-prompt-then-make-the-image",
    summary: "Turn an idea into a written image prompt and a generated image. The prompt and image remain separate outputs you can inspect.",
    providers: "OpenAI and FAL API keys. The shipped graph uses GPT-5 mini and FLUX.1 Schnell.",
    steps: [
      "In Studio, open Write the Prompt, Then Make the Image from the template library.",
      "Connect OpenAI and FAL in provider settings. Each provider bills its own model calls.",
      "Enter an idea, such as a blue ceramic cup on a sunlit desk, and run the workflow.",
      "Inspect prompt_used and image. Change the idea, save the workflow, and run it again.",
    ],
  },
  "movie-posters": {
    name: "Movie Posters",
    route: "/templates/movie-posters",
    summary: "Start with the same title, genre, and visual-style inputs used by the poster workflow. Inspect the art direction and revise the generated concepts.",
    providers: "OpenAI and FAL API keys. The shipped template uses GPT-5 mini and FLUX.1 Schnell. The gallery is an example, not a promise of identical output.",
    steps: [
      "In Studio, open Movie Posters from the template library.",
      "Connect OpenAI and FAL in provider settings. Review the selected models before spending on a run.",
      "Set Movie Title, Genre, and Visual Style, then run the workflow.",
      "Inspect the Poster output. Revise the brief or model, then save and rerun the workflow.",
    ],
  },
} as const;

export type SearchStarter = keyof typeof searchStarters;

export function getSearchStarter(value: string | null): SearchStarter | undefined {
  return Object.keys(searchStarters).find((key): key is SearchStarter => key === value);
}
