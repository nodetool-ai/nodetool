"use client";
import React from "react";
import { motion } from "framer-motion";
import Tilt3D from "../Tilt3D";
import {
  Camera,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  Megaphone,
  Music,
  Palette,
  ScrollText,
  Sparkles,
  LucideIcon,
} from "lucide-react";

interface AgentUseCasesSectionProps {
  reducedMotion?: boolean;
}

interface UseCase {
  name: string;
  description: string;
  icon: LucideIcon;
  iconBgFrom: string;
  iconBgTo: string;
  example: string;
}

const useCases: UseCase[] = [
  {
    name: "Brand Pack Generator",
    description:
      "One agent, one brief, a full launch kit. Hero stills, social cuts, ad variants, and a music bed — all in your palette, all on brief. Hand it the style guide once and let it carry the look across the deliverables.",
    icon: Palette,
    iconBgFrom: "from-rose-600/20",
    iconBgTo: "to-amber-600/20",
    example: "Generate the launch pack for the spring drop in our brand palette",
  },
  {
    name: "Video Ad Director",
    description:
      "An agent that storyboards a 15-second spot, picks Seedance for the hero shot and Kling for B-roll, animates the cuts, and drops a Suno track underneath. Bring your brief — it'll bring the cut.",
    icon: Film,
    iconBgFrom: "from-amber-600/20",
    iconBgTo: "to-rose-600/20",
    example: "Direct a 9:16 sneaker ad, neon noir, ending on the logo",
  },
  {
    name: "Music Video Pipeline",
    description:
      "Drop in a track, let the agent pace cuts to the beat, pick scenes that match the lyrics, generate visuals across Flux and Veo, and stitch the final video. You direct, it edits.",
    icon: Music,
    iconBgFrom: "from-cyan-600/20",
    iconBgTo: "to-blue-600/20",
    example: "Cut a moody music video for this Suno track, 4 scenes",
  },
  {
    name: "Batch Retouching Agent",
    description:
      "Hand it a folder of raw shots. It color-matches to your reference, upscales, removes the bins in the background, and exports the keepers. Your repeatable retouching, run while you sleep.",
    icon: Camera,
    iconBgFrom: "from-emerald-600/20",
    iconBgTo: "to-teal-600/20",
    example: "Retouch this shoot to match the editorial reference",
  },
  {
    name: "Social Calendar Agent",
    description:
      "Give it the campaign and the calendar. It plans the posts, generates the visuals, drafts the captions, and queues 30 days of content in your voice across IG, TikTok, and X formats.",
    icon: Megaphone,
    iconBgFrom: "from-pink-600/20",
    iconBgTo: "to-rose-600/20",
    example: "Plan and generate four weeks of launch posts in our voice",
  },
  {
    name: "Variant Explorer",
    description:
      "Ten alts of the hero frame in five aspect ratios, ranked by how on-brief they are. The agent fans out across providers, scores the results, and surfaces only the cuts worth your time.",
    icon: LayoutGrid,
    iconBgFrom: "from-indigo-600/20",
    iconBgTo: "to-cyan-600/20",
    example: "Give me 10 alts of the hero shot, ranked by brief match",
  },
  {
    name: "Mood Board Researcher",
    description:
      "Tell it the vibe — \"Wong Kar-wai meets a Tokyo arcade\" — and it pulls references, distills a palette, drafts a shot list, and seeds prompts the rest of your canvas can run with.",
    icon: ImageIcon,
    iconBgFrom: "from-violet-600/20",
    iconBgTo: "to-pink-600/20",
    example: "Build a mood board for a perfume launch, dreamy + analog",
  },
  {
    name: "Script-to-Storyboard",
    description:
      "Paste a script. The agent breaks it into beats, generates a storyboard frame for each, suggests camera moves, and hands the boards to a video model when you give the green light.",
    icon: ScrollText,
    iconBgFrom: "from-amber-600/20",
    iconBgTo: "to-orange-600/20",
    example: "Storyboard this 60-second narration scene by scene",
  },
  {
    name: "Voiceover & Localization",
    description:
      "An ElevenLabs agent that drafts read-throughs, clones a presenter for pickups, and dubs the same spot into five languages — lip-sync timing intact, brand voice consistent.",
    icon: Sparkles,
    iconBgFrom: "from-teal-600/20",
    iconBgTo: "to-emerald-600/20",
    example: "Localize this ad into ES, FR, DE, JP, PT — keep my voice",
  },
];

export default function AgentUseCasesSection({
  reducedMotion = false,
}: AgentUseCasesSectionProps) {
  return (
    <section
      id="use-cases"
      aria-labelledby="use-cases-title"
      className="relative py-24 overflow-hidden"
    >
      {/* Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[500px] bg-teal-900/20 blur-[120px] rounded-full opacity-50" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mb-16 text-center max-w-2xl mx-auto">
          <motion.h2
            id="use-cases-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Agents your studio{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-amber-300 to-cyan-400">
              actually ships with.
            </span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-lg text-neutral-400 leading-relaxed"
          >
            Open one, swap in your style guide, point it at the providers you already pay
            for, and let it run while you direct. Starter workflows live in the{" "}
            <a
              href="https://github.com/nodetool-ai/nodetool/tree/main/examples"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 hover:text-amber-300 underline underline-offset-2"
            >
              examples repository
            </a>.
          </motion.p>
        </div>

        <motion.div
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={{
            show: { transition: { staggerChildren: 0.08 } },
          }}
        >
          {useCases.map((item) => (
            <motion.div
              key={item.name}
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
            >
              <Tilt3D className="h-full">
                <div className="group relative h-full flex flex-col rounded-2xl border border-white/5 bg-neutral-900/40 backdrop-blur-sm p-8 transition-all duration-300 hover:bg-neutral-900/60 hover:border-white/10 hover:shadow-2xl">
                  {/* Icon */}
                  <div
                    className={`mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${item.iconBgFrom} ${item.iconBgTo} shadow-lg ring-1 ring-white/10 group-hover:scale-110 transition-transform duration-300`}
                  >
                    <item.icon className={`h-7 w-7 text-white`} aria-hidden="true" />
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-amber-200 transition-colors">
                    {item.name}
                  </h3>
                  <p className="text-neutral-400 leading-relaxed mb-4 flex-grow">
                    {item.description}
                  </p>

                  {/* Example */}
                  <div className="mt-auto pt-4 border-t border-white/5">
                    <p className="text-xs text-neutral-500 uppercase tracking-wider mb-2">
                      Tell the agent
                    </p>
                    <p className="text-sm text-amber-300/80 italic">
                      &quot;{item.example}&quot;
                    </p>
                  </div>
                </div>
              </Tilt3D>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
        >
          <a
            href="https://github.com/nodetool-ai/nodetool/tree/main/examples/workflows"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-rose-500/80 to-amber-500/80 text-white font-semibold hover:from-rose-400 hover:to-amber-400 transition-all shadow-lg shadow-rose-900/30 hover:shadow-rose-900/50"
          >
            Browse the starter workflows
            <span className="text-lg">→</span>
          </a>
        </motion.div>
      </div>
    </section>
  );
}
