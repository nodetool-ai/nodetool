import React from "react";
import ProjectShowcase from "./ProjectShowcase";

export default function ProjectSection() {
  return (
    <section
      id="projects"
      aria-labelledby="projects-title"
      className="relative py-16 sm:py-24 overflow-clip-safe"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* The header shares the player's 5xl column so the copy lines up with
            the frame beneath it. */}
        <header className="scroll-fade mx-auto mb-10 max-w-5xl">
          <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-300/80">
            <span className="h-px w-8 bg-fuchsia-300/60" />
            You and the agent, same project
          </div>
          <h2
            id="projects-title"
            className="text-3xl md:text-5xl font-bold tracking-tight text-white"
          >
            From an idea to a video you can edit.
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-400">
            Send the agent a one-line note about one shot. It renders that
            shot again, and the timeline picks up the new take. You can make
            the same change yourself in the storyboard or on the timeline.
          </p>
        </header>
        <ProjectShowcase />
      </div>
    </section>
  );
}
