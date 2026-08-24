/**
 * "Price it first" — the agent looks up what the render would actually cost
 * before spending anything, and puts the four candidates in a table. The
 * screenshot is the bring-your-own-key frame: the bill is a number you see
 * before the run, not a credit balance that quietly drains.
 */
import {
  assistantStart,
  assistantStream,
  status,
  toolMessage,
  userMessage,
} from "../chatCastHelpers";
import type { ChatDemoCast } from "../chatCastTypes";
import { MARKETING_CHAT_MODEL, at } from "./shared";

const OPENING = [
  "Good call. Let me pull the real numbers — first what the model catalog ",
  "exposes, then the provider's own pricing pages:",
];

const NO_CATALOG_PRICING = [
  "No pricing in the catalog for three of the four — checking the provider ",
  "pages directly:",
];

const TABLE = [
  "Here are the real numbers, pulled just now. The board is 6 clips totalling ",
  "**24 seconds** of video:\n\n",
  "| Model | Price/sec | Full board (24s) | Notes |\n",
  "| --- | --- | --- | --- |\n",
  "| **MiniMax H3** · 768p | $0.06 | **~$1.45** | cheapest, up to 2K at $0.13/s |\n",
  "| **Wan 2.7** · 720p | $0.10 | ~$2.40 | solid generalist |\n",
  "| **Gemini Omni Flash** · 720p | $0.125 | **~$3.00** | generates synced audio — engine roar, wind |\n",
  "| **Veo 3.1 Fast** · with audio | $0.15 | ~$3.60 | highest fidelity of the four |\n\n",
  "My recommendation: **Omni Flash**. The extra $1.55 over MiniMax buys synced ",
  "audio for all six shots, which a chase teaser lives or dies on.\n\n",
  "Cheaper way in: render **shot 6 alone** (~$0.60) as a taste test, then commit ",
  "to the full board. Say which and I will run it.",
];

const WEB_SEARCH_QUERIES = [
  "fal.ai gemini omni flash video price per second",
  "fal.ai veo 3.1 fast price per second video generation",
  "fal.ai minimax H3 video pricing per second",
  "fal.ai wan 2.7 video model price",
];

export const costPreviewCast: ChatDemoCast = {
  version: 1,
  kind: "chat",
  id: "chat-cost-preview",
  name: "Price the render first",
  description:
    "Web searches and page fetches priced against the board before a credit is spent.",
  createdAt: "2026-08-24T10:00:00.000Z",
  durationMs: 14000,
  fps: 30,
  model: MARKETING_CHAT_MODEL,
  events: [
    status(0, "connected"),
    userMessage(200, "estimate costs first"),
    status(500, "streaming"),

    assistantStart(
      800,
      "cost-1",
      [
        {
          id: "cost-call-1",
          name: "execute_code",
          args: {
            title: "Listing video models and their pricing fields",
            code: [
              'const models = await nodetool.models.list("text_to_video");',
              "return models.map((m) => ({ id: m.id, price: m.price_per_second }));",
            ].join("\n"),
          },
        },
      ],
      at(0)
    ),
    toolMessage(
      1100,
      "cost-call-1",
      "execute_code",
      "12 models, 9 without pricing metadata",
      at(206)
    ),
    ...assistantStream("cost-1", OPENING, 1400, 1400),

    // A run of four same-name calls collapses into one group card.
    assistantStart(
      3200,
      "cost-2",
      WEB_SEARCH_QUERIES.map((query, i) => ({
        id: `cost-search-${i + 1}`,
        name: "web_search",
        args: { query },
      })),
      at(3200)
    ),
    ...WEB_SEARCH_QUERIES.map((query, i) =>
      toolMessage(
        4000 + i * 40,
        `cost-search-${i + 1}`,
        "web_search",
        { results: [{ title: `${query} — fal.ai`, source: "fal.ai" }] },
        at(3200 + 8800)
      )
    ),
    ...assistantStream("cost-2", NO_CATALOG_PRICING, 4400, 1300),

    assistantStart(
      6000,
      "cost-3",
      [
        {
          id: "cost-fetch-1",
          name: "browser",
          args: { url: "https://fal.ai/models/fal-ai/minimax/hailuo-h3" },
        },
        {
          id: "cost-fetch-2",
          name: "browser",
          args: { url: "https://fal.ai/models/fal-ai/wan/v2.7" },
        },
      ],
      at(6000)
    ),
    toolMessage(
      7200,
      "cost-fetch-1",
      "browser",
      "$0.06 per second at 768p, $0.13 per second at 2K",
      at(6000 + 6000)
    ),
    toolMessage(
      7240,
      "cost-fetch-2",
      "browser",
      "$0.10 per second at 720p",
      at(6000 + 5800)
    ),

    assistantStart(7600, "cost-4", undefined, at(7600)),
    ...assistantStream("cost-4", TABLE, 7900, 5300),
    status(13400, "connected"),
  ],
};
