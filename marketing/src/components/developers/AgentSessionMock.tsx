import React from "react";

const sprites = [
  { file: "hero.png", src: "/developers/sprite-hero.webp", width: 239, alt: "A flame spirit hero sprite" },
  { file: "crawler.png", src: "/developers/sprite-crawler.webp", width: 314, alt: "A shadow crawler enemy sprite" },
  { file: "mushroom.png", src: "/developers/sprite-mushroom.webp", width: 336, alt: "A glowing mushroom sprite" },
];

/** Signals transparency behind each sprite, as an image editor does. */
const checkerboard: React.CSSProperties = {
  backgroundColor: "#111827",
  backgroundImage:
    "linear-gradient(45deg, #1b2433 25%, transparent 25%), linear-gradient(-45deg, #1b2433 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1b2433 75%), linear-gradient(-45deg, transparent 75%, #1b2433 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
};

/**
 * A static picture of a coding-agent session that calls the NodeTool MCP
 * server. The sprites are the real ones from the Kindle game shown in the
 * video further down the page. The session itself is illustrative.
 */
export default function AgentSessionMock() {
  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950 shadow-2xl shadow-black/50 ring-1 ring-white/5">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <span aria-hidden="true" className="h-3 w-3 rounded-full bg-slate-700" />
          <span aria-hidden="true" className="h-3 w-3 rounded-full bg-slate-700" />
          <span aria-hidden="true" className="h-3 w-3 rounded-full bg-slate-700" />
          <span className="ml-3 font-jetbrains text-xs text-slate-500">~/kindle</span>
        </div>

        <div className="space-y-5 p-5 font-jetbrains text-[13px] leading-relaxed sm:p-6">
          <p className="text-slate-100">
            <span className="select-none text-blue-300">&gt; </span>
            Make sprites for my platformer: a flame spirit hero, a shadow
            crawler, a glowing mushroom. Transparent, into assets/.
          </p>

          <p className="flex items-center gap-2 text-slate-300">
            <span aria-hidden="true" className="text-emerald-400">
              ●
            </span>
            nodetool · generate image ×3
          </p>

          <ul className="grid grid-cols-3 gap-3">
            {sprites.map((sprite) => (
              <li key={sprite.file} className="min-w-0">
                <div
                  className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-slate-800 p-3"
                  style={checkerboard}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sprite.src}
                    alt={sprite.alt}
                    width={sprite.width}
                    height={320}
                    decoding="async"
                    className="no-desaturate block max-h-full w-auto max-w-full object-contain"
                  />
                </div>
                <p className="mt-2 truncate text-slate-400">
                  <span className="text-emerald-400">✓</span> {sprite.file}
                </p>
              </li>
            ))}
          </ul>

          <p className="text-slate-300">
            Saved 3 sprites. Want a background for the level next?
          </p>
        </div>
      </div>
    </figure>
  );
}
