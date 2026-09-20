import React from "react";
import ProjectShowcase from "./ProjectShowcase";

export default function ProjectSection() {
  return (
    <section
      id="projects"
      aria-labelledby="projects-title"
      className="relative py-24 overflow-clip-safe"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* The header shares the player's 5xl column so the copy lines up with
            the frame beneath it. */}
        <header className="scroll-fade mx-auto mb-10 max-w-5xl">
          <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-300/80">
            <span className="h-px w-8 bg-fuchsia-300/60" />
            Agents
          </div>
          <h2
            id="projects-title"
            className="text-3xl md:text-5xl font-bold tracking-tight text-white"
          >
            Describe it. The agent builds the project.
          </h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-400">
            Give the agent a brief. It drafts the script, boards the shots,
            renders the takes, and cuts them on a timeline. What comes back is a
            project you can open. Change any part of it yourself, or send the
            agent back in with a note about the one shot you want different.
          </p>
        </header>
        <ProjectShowcase />
      </div>
    </section>
  );
}
