/**
 * Copy for /marketing, shared by the page and its Markdown mirror
 * (scripts/generate-llms-txt.mjs). The routes are checked against the
 * frontmatter of packages/system-skills/{launch-commercial,motion-ad}/SKILL.md
 * and the ad-*.app.json descriptions in packages/base-nodes/nodetool/examples/apps/.
 */

export const MARKETING_LEAD =
  "NodeTool is open-source AI ad software. Give the agent a product photo and a brief. It storyboards the spot, renders stills and clips on your provider keys, and cuts a timeline you can edit. Adapt format makes 9:16, 4:5, and 1:1 versions, and Recast puts the next product into the same board.";

export const FROM_LINK_INTRO =
  "Paste the link into the chat and say what you need. The agent does the rest. Generated footage, voice, and music are billed to your provider accounts.";

export const FROM_LINK_ROUTES = [
  {
    title: "A finished commercial",
    body: "The agent reads the page, writes the storyboard, renders stills and clips, adds voice and music, and assembles a timeline you can edit. It reports the real cost.",
  },
  {
    title: "A sound-off motion ad",
    body: "The agent builds a 15-second animated ad for Facebook, Instagram, or TikTok from the page's real screenshots and photos, and checks every claim against the page.",
  },
  {
    title: "An ad from a template",
    body: "Each ad template in the ad library is a mini app. AI can fill its fields with copy and images from a website. It builds an editable vertical ad without generated video.",
  },
];
