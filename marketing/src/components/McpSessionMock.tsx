import React from "react";

const CALLS = [
  { tool: "execute_code", detail: "storyboard · 5 shots" },
  { tool: "execute_code", detail: "render stills · 5 of 5" },
  { tool: "view_image", detail: "shot 3 · Eyes under the bed" },
];

/**
 * A static picture of a coding-agent session that drives the NodeTool MCP
 * server. The tool names are the server's real direct tools, and the frame is
 * the recorded storyboard surface from the agents page. The session text is
 * illustrative.
 */
export default function McpSessionMock() {
  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950 shadow-2xl shadow-black/50 ring-1 ring-white/5">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <span aria-hidden="true" className="h-3 w-3 rounded-full bg-slate-700" />
          <span aria-hidden="true" className="h-3 w-3 rounded-full bg-slate-700" />
          <span aria-hidden="true" className="h-3 w-3 rounded-full bg-slate-700" />
          <span className="ml-3 font-jetbrains text-xs text-slate-500">claude · nodetool MCP</span>
        </div>

        <div className="space-y-4 p-5 font-jetbrains text-[13px] leading-relaxed sm:p-6">
          <p className="text-slate-100">
            <span className="select-none text-blue-300">&gt; </span>
            Storyboard a five-shot short called Under the Bed, then render the
            stills.
          </p>

          <ul className="space-y-1.5">
            {CALLS.map((call) => (
              <li key={call.detail} className="flex min-w-0 items-center gap-2 text-slate-300">
                <span aria-hidden="true" className="text-emerald-400">●</span>
                <span className="shrink-0 text-cyan-200">nodetool · {call.tool}</span>
                <span className="truncate text-slate-500">{call.detail}</span>
              </li>
            ))}
          </ul>

          <div className="overflow-hidden rounded-lg border border-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/surface-storyboard-poster.webp"
              alt="A five-shot storyboard for Under the Bed open in NodeTool Studio, each shot with a rendered still"
              width={1920}
              height={1080}
              decoding="async"
              className="no-desaturate block h-auto w-full"
            />
          </div>

          <p className="text-slate-300">
            The storyboard is in your project. Open it in Studio to re-take a shot.
          </p>
        </div>
      </div>
      <figcaption className="mt-3 text-sm text-slate-500">
        An illustrative session. The tool names are the ones the server registers.
      </figcaption>
    </figure>
  );
}
