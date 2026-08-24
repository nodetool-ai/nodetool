/**
 * "What can we build here?" — the agent reads the installed capabilities and
 * answers with a map of them, grouped by the job rather than by the package.
 * The screenshot this cast produces is the "it knows the studio" frame.
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

const ASSISTANT_ID = "cap-assistant";
const CALL_ID = "cap-call-1";

const ANSWER = [
  "Quite a lot — here is the honest map of this workspace, grouped by what you would actually build:\n\n",
  "### Video & social\n\n",
  "- **Ad and trailer pipelines** — brief → script → storyboard → rendered clips → a cut timeline. Every step is a document you can open and change.\n",
  "- **Voiceover** — write a script, give each line a voice (`scripts` + `voice`), lay the takes onto a timeline with word-level captions.\n",
  "- **Image → video animation**, clip editing server-side (split, trim, animate, add text), and ffmpeg-grade assembly without opening an editor.\n\n",
  "### Images & design\n\n",
  "- Generate and edit images, then iterate against a critic model (`critique`, `compare`, `scoreAdherence`) until they match the brief.\n",
  "- **Sketches** — layered canvas documents, built programmatically or painted by hand.\n",
  "- Vector graphics through the Fabric pack — diagrams, badges, social cards.\n\n",
  "### Documents & data\n\n",
  "- PDF ↔ Markdown ↔ DOCX, table extraction, XLSX read/write — \"drop in 20 PDFs, get one summarized digest\".\n",
  "- RAG collections, web search and page fetching, and a JavaScript sandbox for the glue in between.\n\n",
  "Say the word and I will build one of these end to end — you will get the workflow, not just the answer.",
];

export const capabilityMapCast: ChatDemoCast = {
  version: 1,
  kind: "chat",
  id: "chat-capability-map",
  name: "What can we build?",
  description:
    "The agent inspects the installed capabilities and maps them to jobs.",
  createdAt: "2026-08-24T10:00:00.000Z",
  durationMs: 9000,
  fps: 30,
  model: MARKETING_CHAT_MODEL,
  events: [
    status(0, "connected"),
    userMessage(200, "what can we build here?"),
    status(500, "streaming"),

    assistantStart(
      800,
      ASSISTANT_ID,
      [
        {
          id: CALL_ID,
          name: "execute_code",
          args: {
            title: "Checking installed capabilities and examples",
            code: [
              "const caps = await nodetool.capabilities.list();",
              "const examples = await nodetool.workflows.listExamples();",
              "return { caps: caps.length, examples: examples.length };",
            ].join("\n"),
          },
        },
      ],
      at(0)
    ),
    toolMessage(
      1400,
      CALL_ID,
      "execute_code",
      "{ caps: 41, examples: 68 }",
      at(412)
    ),

    ...assistantStream(ASSISTANT_ID, ANSWER, 1700, 6200),
    status(8200, "connected"),
  ],
};
