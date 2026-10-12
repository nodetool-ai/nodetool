import React from "react";
import { Check, Minus } from "lucide-react";

/*
 * What each consumer plan runs in NodeTool, checked against the providers in
 * packages/runtime/src/providers: `codex` (Sign in with ChatGPT),
 * `claude_agent_sdk` (Sign in with Claude), `chatgpt` (images in the user's
 * chatgpt.com tab) and `gemini_web` (chat, images and video in the user's
 * gemini.google.com tab). The two tab providers run only on local installs,
 * through the NodeTool Chrome extension, and Sign in with Claude is local-only
 * too. Change this table when those change.
 */
const plans: {
  name: string;
  agent: boolean;
  images: boolean;
  video: boolean;
}[] = [
  { name: "ChatGPT", agent: true, images: true, video: false },
  { name: "Claude", agent: true, images: false, video: false },
  { name: "Gemini", agent: true, images: true, video: true },
];

const columns = [
  { key: "agent", label: "Chat and agent" },
  { key: "images", label: "Images" },
  { key: "video", label: "Video" },
] as const;

interface SubscriptionSectionProps {
  /** Prefix for the section's ids, unique per page. */
  idPrefix?: string;
  className?: string;
}

export default function SubscriptionSection({
  idPrefix = "subscription",
  className = "",
}: SubscriptionSectionProps) {
  const titleId = `${idPrefix}-title`;
  return (
    <section
      id={idPrefix}
      aria-labelledby={titleId}
      className={`relative scroll-mt-28 ${className}`}
    >
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-slate-950/70 p-8 shadow-2xl shadow-black/50 md:p-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 left-1/3 h-72 w-[36rem] rounded-full bg-emerald-500/10 blur-3xl"
          />
          <div className="relative grid gap-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                Use your subscription
              </p>
              <h2
                id={titleId}
                className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white md:text-4xl"
              >
                Run NodeTool on the AI plan you already pay for.
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-300">
                Sign in with ChatGPT or Claude, and the agent runs on your
                subscription. Your ChatGPT and Gemini plans also generate
                images, and Gemini generates video. No API key, and no
                pay-per-call bill for those runs. They count against your
                plan&apos;s own limits.
              </p>
            </div>
            <div className="lg:col-span-6">
              <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    What each subscription runs in NodeTool
                  </caption>
                  <thead>
                    <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400">
                      <th scope="col" className="px-4 py-3 font-semibold sm:px-5">
                        Plan
                      </th>
                      {columns.map((c) => (
                        <th
                          key={c.key}
                          scope="col"
                          className="px-2 py-3 text-center font-semibold sm:px-4"
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((plan) => (
                      <tr
                        key={plan.name}
                        className="border-b border-slate-800/70 last:border-b-0"
                      >
                        <th
                          scope="row"
                          className="px-4 py-4 text-base font-semibold text-white sm:px-5"
                        >
                          {plan.name}
                        </th>
                        {columns.map((c) => (
                          <td key={c.key} className="px-2 py-4 text-center sm:px-4">
                            {plan[c.key] ? (
                              <Check
                                className="mx-auto h-5 w-5 text-emerald-400"
                                aria-label="Yes"
                              />
                            ) : (
                              <Minus
                                className="mx-auto h-5 w-5 text-slate-500"
                                aria-label="No"
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-400">
                Subscriptions run in Studio, the desktop app. Gemini, and
                image generation on ChatGPT, also need the{" "}
                <a
                  href="https://docs.nodetool.ai/chrome-extension"
                  className="text-blue-300 underline underline-offset-2 hover:text-blue-200 focus-ring"
                >
                  NodeTool Chrome extension
                </a>{" "}
                in the browser where you are signed in.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
