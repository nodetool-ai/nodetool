"use client";
import React from "react";
import Image from "next/image";
import {
  PhotoIcon,
  CubeTransparentIcon,
  PuzzlePieceIcon,
  MusicalNoteIcon,
  BookOpenIcon,
} from "@heroicons/react/20/solid";

const cardBase =
  "card relative rounded-2xl bg-slate-900/60 border border-slate-800/60 ring-1 ring-white/5 backdrop-blur-md shadow-soft";
const cardHoverUnified = "lift hover:border-blue-500/50 hover:shadow-strong";
const cardInnerGlow =
  "pointer-events-none absolute inset-0 rounded-2xl opacity-0 motion-safe:transition-opacity motion-safe:duration-300 group-hover:opacity-100";
const sectionNarrow = "mx-auto max-w-2xl px-6";
const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";
const strongShadow = "shadow-strong";
const subtleShadow = "shadow-soft";

const accentGlows = [
  {
    background:
      "radial-gradient(120% 120% at 50% 0%, rgba(37,99,235,0.10), transparent 55%)",
  },
  {
    background:
      "radial-gradient(120% 120% at 50% 0%, rgba(168,85,247,0.10), transparent 55%)",
  },
  {
    background:
      "radial-gradient(120% 120% at 50% 0%, rgba(16,185,129,0.10), transparent 55%)",
  },
];

const cardInnerGlowStyle = {
  background:
    "radial-gradient(120% 120% at 50% 0%, rgba(37,99,235,0.08), transparent 55%)",
};

export default function AssetManagerSection() {
  return (
    <section
      id="asset-manager"
      aria-labelledby="asset-title"
      className="section-relative isolate overflow-hidden pb-16 pt-14 sm:pb-20"
    >
      <div className={`${sectionNarrow} text-center`}>
        <h2 className="text-base font-medium leading-7 text-blue-400">
          Organize Everything
        </h2>
        <h3 id="asset-title" className="mt-2 text-3xl font-bold text-white">
          Built-in Asset Manager
        </h3>
        <p className="section-subtitle mt-4 text-slate-300">
          Centralized asset management. Drag files in, use them anywhere.
        </p>
      </div>

      <div className={`${sectionContainer} relative mt-12`}>
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div>
            <div
              className={`overflow-hidden rounded-lg border border-blue-800/30 ${strongShadow}`}
            >
              <Image
                src="/screen_assets.jpg"
                alt="NodeTool Asset Manager interface preview"
                width={1200}
                height={800}
                className="h-auto w-full"
                loading="lazy"
              />
            </div>
          </div>

          <div className="space-y-8">
            {[
              {
                icon: PhotoIcon,
                title: "Import & organize",
                body: "Drag and drop. Files auto-organize by type, project, or tags.",
              },
              {
                icon: CubeTransparentIcon,
                title: "Preview files",
                body: "Built-in preview for images, audio, video, and documents.",
              },
              {
                icon: PuzzlePieceIcon,
                title: "Use in workflows",
                body: "Reference assets in your workflows—folders or single files.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="group">
                <h4 className="mb-3 flex items-center text-xl font-semibold text-white">
                  <Icon
                    className="mr-2 h-5 w-5 text-blue-400 motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-110"
                    aria-hidden="true"
                  />
                  {title}
                </h4>
                <p className="text-slate-200">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            {
              icon: PhotoIcon,
              title: "Images & Graphics",
              body: "PNG, JPG, GIF, SVG, WebP",
            },
            {
              icon: MusicalNoteIcon,
              title: "Audio & Video",
              body: "MP3, WAV, MP4, MOV, AVI",
            },
            {
              icon: BookOpenIcon,
              title: "Documents & Data",
              body: "PDF, TXT, JSON, CSV, DOCX",
            },
          ].map(({ icon: Icon, title, body }, i) => (
            <div
              key={title}
              className={`group ${cardBase} ${cardHoverUnified} p-6 text-center overflow-hidden`}
            >
              <div
                className={cardInnerGlow}
                style={accentGlows[i % accentGlows.length]}
              />
              <div className="relative">
                <Icon
                  className="mx-auto mb-3 h-8 w-8 text-blue-400 motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-110"
                  aria-hidden="true"
                />
                <h5 className="mb-2 text-lg font-medium text-white">{title}</h5>
                <p className="text-sm text-slate-300">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
