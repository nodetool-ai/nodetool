"use client";
/**
 * One project, start to finish, in four frames: the sentence that started it,
 * the agent doing the work, the documents it left, and the library they land
 * in. Every frame is the real UI — the project views come from the
 * documentation screenshot suite driven against a seeded backend
 * (`packages/websocket/src/screenshot-projects.ts`), the chat frame from the
 * chat demo harness (`web/src/demo/chat/marketing/`).
 *
 * The frames are one session on purpose: the six keyframes rendered in "Watch"
 * are the six stills on the board in "Open". Each tab is deep-linkable as
 * `#project-<id>`.
 */
import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  MessageSquarePlus,
  Clapperboard,
  LayoutPanelLeft,
  Library,
  type LucideIcon,
} from "lucide-react";
import { CHAT_SHOTS } from "../data/chatShots.generated";
import { PROJECT_SHOTS } from "../data/projectShots.generated";

/** A screenshot to render: where it lives, and the size `next/image` needs. */
interface Shot {
  src: string;
  width: number;
  height: number;
}

const shotFrom = (
  shots: readonly { id: string; width: number; height: number }[],
  dir: string,
  id: string
): Shot => {
  const found = shots.find((shot) => shot.id === id);
  if (!found) throw new Error(`No screenshot "${id}" in /${dir}`);
  return { src: `/${dir}/${id}.webp`, width: found.width, height: found.height };
};

const projectShot = (id: string) => shotFrom(PROJECT_SHOTS, "projects", id);
const chatShot = (id: string) => shotFrom(CHAT_SHOTS, "chat", id);

interface Frame {
  /** Tab id, and the deep link fragment. */
  id: string;
  /** Short label for the pill row. The number carries the sequence. */
  label: string;
  icon: LucideIcon;
  shot: Shot;
  headline: string;
  body: string;
}

const FRAMES: Frame[] = [
  {
    id: "ask",
    label: "Ask",
    icon: MessageSquarePlus,
    shot: projectShot("project-new"),
    headline: "It starts with a sentence, not a blank canvas",
    body: "Say what you want made and pick its shape — a 30-second spot, a trailer, a mini app — and the agent plans the documents that shape needs. The estimate under the prompt is read off what your own past projects of that shape cost, so you know the order of magnitude before anything runs.",
  },
  {
    id: "watch",
    label: "Watch",
    icon: Clapperboard,
    shot: chatShot("chat-storyboard-stills"),
    headline: "Every step runs in the open",
    body: "A board created, six keyframes rendered, a contact sheet built — each call is a card you can expand to see the code it ran and what came back. No spinner standing in for the work, and every shot keeps the prompt and the model that made it, so you can re-roll one without touching the other five.",
  },
  {
    id: "open",
    label: "Open",
    icon: LayoutPanelLeft,
    shot: projectShot("project-overview"),
    headline: "What it leaves behind opens in an editor",
    body: "The same six shots, now a board with its stills, a script with the one line still to re-voice, and a cut with its tracks — each card opens the editor that made it. The conversation stays on the left, and the bar along the bottom splits the spend into stills, clips, voice and pipeline. Your keys, your invoice, at provider rates.",
  },
  {
    id: "keep",
    label: "Keep",
    icon: Library,
    shot: projectShot("project-list"),
    headline: "Projects, not chat history",
    body: "Every project keeps what it rendered, what it cost, and where it stands. Open one and its board, script and cut come back as a tab group; drag a loose document onto a card to file it there. Change a shot and re-run — nothing has to be rebuilt from the transcript.",
  },
];

export default function ProjectShowcase() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace("#project-", "");
      const at = FRAMES.findIndex((f) => f.id === id);
      if (at !== -1) setActive(at);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const select = useCallback((index: number) => {
    setActive(index);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#project-${FRAMES[index].id}`);
    }
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const delta =
        event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!delta) return;
      event.preventDefault();
      select((active + delta + FRAMES.length) % FRAMES.length);
    },
    [active, select]
  );

  return (
    <div className="relative mx-auto max-w-5xl">
      <div
        role="tablist"
        aria-label="One project, four frames"
        onKeyDown={onKeyDown}
        className="flex flex-wrap justify-center gap-2 mb-8"
      >
        {FRAMES.map((frame, i) => {
          const Icon = frame.icon;
          const selected = i === active;
          return (
            <button
              key={frame.id}
              role="tab"
              id={`project-tab-${frame.id}`}
              aria-selected={selected}
              aria-controls={`project-panel-${frame.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(i)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm focus-ring motion-safe:transition-colors ${
                selected
                  ? "border-slate-300 bg-slate-100 text-slate-900"
                  : "border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden />
              <span aria-hidden className="font-mono text-xs opacity-60">
                {i + 1}
              </span>
              {frame.label}
            </button>
          );
        })}
      </div>

      {FRAMES.map((frame, i) => (
        <div
          key={frame.id}
          role="tabpanel"
          id={`project-panel-${frame.id}`}
          aria-labelledby={`project-tab-${frame.id}`}
          hidden={i !== active}
        >
          <div className="card relative overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-900/60 ring-1 ring-white/5 backdrop-blur-md">
            <Image
              src={frame.shot.src}
              alt={`${frame.label}: ${frame.headline}`}
              width={frame.shot.width}
              height={frame.shot.height}
              priority={i === 0}
              loading={i === 0 ? undefined : "lazy"}
              className="w-full h-auto block"
            />
          </div>

          <div className="mt-6 max-w-3xl">
            <h3 className="text-xl md:text-2xl font-semibold text-white">
              {frame.headline}
            </h3>
            <p className="mt-2 text-slate-300">{frame.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
