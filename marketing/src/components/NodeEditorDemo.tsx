"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { MousePointerClick } from "lucide-react";
import { useNearViewport } from "../lib/useNearViewport";
import type { EditorDemoCopy } from "@/i18n/content";

/**
 * The real node editor from the app, built into public/embed/node-editor/
 * (`npm run build:node-editor-embed` in web/). Run answers in the page with
 * sample stills and clips from public/node-editor-demo/, so no model is
 * called. The page shows a screenshot until the visitor opens the editor,
 * so the editor's scripts never load with the page.
 */
const EMBED_SRC = "/embed/node-editor/node-editor-embed.html";

const DEFAULT_TITLE = "Try the node editor.";
const DEFAULT_INTRO =
  "This is the editor from NodeTool, running in your browser with a prompt, a Text To Image node, and an Image To Video node. Edit the prompt, drag the nodes, rewire them, add Enhance Prompt or Text To Video from the node menu, and press Run.";

const DEFAULT_OPEN = "Open the node editor";
const DEFAULT_FRAME_TITLE = "NodeTool's node editor (demo with sample results)";
const DEFAULT_NOTE =
  "Run returns sample stills and clips made earlier with NodeTool, picked by words in your prompt. No model runs here and nothing is saved. The editor loads about 3 MB when you open it.";

type NodeEditorDemoProps = {
  /** Section heading. Pages set it to fit their own story. */
  title?: string;
  /** Paragraph under the heading. */
  intro?: string;
  /** Translated pages pass all their words (i18n/content.ts). */
  copy?: EditorDemoCopy;
};

export default function NodeEditorDemo({
  title = DEFAULT_TITLE,
  intro = DEFAULT_INTRO,
  copy,
}: NodeEditorDemoProps = {}) {
  const words = copy ?? { title, intro, open: DEFAULT_OPEN, frameTitle: DEFAULT_FRAME_TITLE, note: DEFAULT_NOTE };
  const [opened, setOpened] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const near = useNearViewport(sectionRef);

  return (
    <section
      ref={sectionRef}
      id="try-the-node-editor"
      aria-labelledby="node-editor-demo-title"
      className="mx-auto mt-24 max-w-6xl scroll-mt-28 px-6"
    >
      <div className="max-w-3xl">
        <h2
          id="node-editor-demo-title"
          className="text-3xl font-semibold tracking-tight text-white md:text-4xl"
        >
          {words.title}
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-slate-300">
          {words.intro}
        </p>
      </div>

      <div className="relative mt-8 h-[36rem] overflow-hidden rounded-2xl border border-slate-700 bg-[#08090a] sm:h-[38rem] lg:h-[40rem]">
        {opened ? (
          <iframe
            src={EMBED_SRC}
            title={words.frameTitle}
            className="h-full w-full"
            allow="fullscreen"
          />
        ) : (
          <>
            {near ? (
              <>
                <Image
                  src="/node-editor-demo/poster-mobile.webp"
                  alt=""
                  fill
                  sizes="100vw"
                  className="object-cover object-top opacity-60 sm:hidden"
                />
                <Image
                  src="/node-editor-demo/poster.webp"
                  alt=""
                  fill
                  sizes="(min-width: 1280px) 1104px, 100vw"
                  className="hidden object-cover object-left-top opacity-60 sm:block"
                />
              </>
            ) : null}
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <button
                type="button"
                onClick={() => setOpened(true)}
                className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-full bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg hover:bg-white"
              >
                <MousePointerClick className="h-5 w-5" aria-hidden="true" />
                {words.open}
              </button>
            </div>
          </>
        )}
      </div>
      <p className="mt-3 text-sm text-slate-400">{words.note}</p>
    </section>
  );
}
