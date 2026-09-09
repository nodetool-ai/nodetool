import React from "react";
import ProjectShowcase from "./ProjectShowcase";

export default function ProjectSection() {
  return (
    <section
      id="projects"
      aria-label="From conversation to complete project"
      className="relative py-24 overflow-clip-safe"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <ProjectShowcase />
      </div>
    </section>
  );
}
