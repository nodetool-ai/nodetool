/**
 * Copy for /marketing, shared by the page and its Markdown mirror
 * (scripts/generate-llms-txt.mjs). The campaign case reads from the accepted
 * run in recipe-assets/2026-09-14-directed-campaign-kit-gpt25/: models and
 * prompts from asset-manifest.json, the limitation from scripts/recipes.mjs.
 */

export const MARKETING_LEAD =
  "NodeTool is open-source AI ad software. Give the agent a product photo and a brief, and it storyboards the spot, renders stills and clips on your provider keys, and cuts a timeline you can edit.";

export const CAMPAIGN_CASE = {
  intro:
    "A launch campaign for a fictional olive travel cup, made with the Directed Campaign Kit. One brief asked for a 16:9 hero, a square post, a vertical story, and one controlled revision. The images carry no text, so the headline and call to action stay editable outside the artwork.",
  hero: "GPT Image 2.5 rendered the hero from the brief: a cobalt platform above water, an amber sunrise, and clean space on the left for copy.",
  formats:
    "The matching edit model recomposed the hero for each format and was told to keep the cup, set, and grade. The square keeps the upper-left copy space and the story keeps its upper third clear.",
  revisionNote:
    "“Reduce the water splash by about half and widen the clean dark-blue copy space on the left.”",
  revision:
    "The one note sent back. The edit model was told to keep the product, set, palette, and camera, so only the splash and the copy space changed.",
  limitation:
    "The cup is a fictional demonstration product. Compare generated product geometry and materials with a real brand reference before you publish.",
};

export const MORE_FOR_AD_TEAMS = [
  {
    title: "Ad library",
    body: "Short vertical ad templates, each with its beats, timing, copy budget, and a rendered example.",
    href: "/ad-library",
  },
  {
    title: "Example storyboards",
    body: "Finished commercials with every shot they were built from.",
    href: "/storyboards",
  },
  {
    title: "Guided recipes",
    body: "Campaign kits, UGC videos, product commercials, and catalogue images, step by step.",
    href: "/recipes",
  },
  {
    title: "Product video from one photo",
    body: "A brief and a product photo become a 16:9 product video you rerun for the next product.",
    href: "/use-cases/product-video",
  },
];
