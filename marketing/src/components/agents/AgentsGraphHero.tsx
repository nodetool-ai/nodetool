import React from "react";
import { motion } from "framer-motion";
import { Command, Sparkles, Download } from "lucide-react";
import { SmartDownloadButton } from "../../app/SmartDownloadButton";

// --- Components ---

export default function AgentsGraphHero() {
    return (
        <div className="min-h-screen w-full bg-[#05050A] text-slate-200 selection:bg-teal-500/30 overflow-x-hidden">

            {/* Background Elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-teal-500 opacity-20 blur-[100px]"></div>
                <div className="absolute right-0 bottom-0 -z-10 h-[400px] w-[400px] rounded-full bg-blue-500 opacity-10 blur-[120px]"></div>
            </div>

            <div className="relative z-10 mx-auto max-w-7xl px-6 pt-20 pb-32 lg:pt-32">
                {/* Header Section */}
                <div className="mx-auto max-w-3xl text-center mb-24">
                    <motion.div
                        initial={false}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25 }}
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-500/10 border border-rose-500/20 mb-6">
                            <Sparkles className="w-4 h-4 text-rose-300" />
                            <span className="text-sm font-medium text-rose-200">
                                Open-source creative AI workspace
                            </span>
                        </div>

                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-8">
                            The whole studio is <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-amber-300 to-cyan-400">
                                the agent&apos;s toolbelt.
                            </span>
                        </h1>

                        <p className="text-lg md:text-xl text-slate-400 mb-10 leading-relaxed max-w-2xl mx-auto">
                            NodeTool isn&apos;t a chat box bolted onto an editor. Every surface —
                            the node canvas, the sketch pad, the storyboard, the video timeline,
                            the app builder — is exposed to agents as tools, around 120 in all.
                            Pitch a concept and the agent drafts the script, boards the scenes,
                            generates the footage across Flux, Seedance, Veo, Kling, Suno, and
                            ElevenLabs, and cuts the timeline. You direct the vision; it does
                            the heavy lifting.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <SmartDownloadButton
                                icon={<Download className="w-5 h-5" />}
                                classNameOverride="px-8 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 transition-all shadow-lg shadow-rose-900/40 flex items-center gap-2"
                            />
                            <a href="/studio" className="px-8 py-4 rounded-xl font-semibold text-white bg-white/5 border border-white/15 hover:bg-white/10 transition-all flex items-center gap-2">
                                See the full studio
                            </a>
                        </div>

                        <div className="mt-8 flex items-center justify-center gap-6 text-sm text-slate-400 font-medium">
                            <span className="flex items-center gap-2"><Command className="w-4 h-4" /> Open Source</span>
                            <span className="w-1 h-1 rounded-full bg-slate-700" />
                            <span>Your own keys, no token markups</span>
                            <span className="w-1 h-1 rounded-full bg-slate-700" />
                            <span>Every decision on screen</span>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
