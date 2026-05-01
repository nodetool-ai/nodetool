"use client";
import React from "react";
import { motion } from "framer-motion";
import Tilt3D from "./Tilt3D";
import { Cloud, Server, Terminal, Zap } from "lucide-react";

interface DeploySectionProps {
  reducedMotion?: boolean;
}

export default function DeploySection({
  reducedMotion = false,
}: DeploySectionProps) {
  return (
    <section id="deploy" className="relative py-24 overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[600px] h-[600px] bg-purple-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Column: Text Content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6">
              Self host <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                on VPS
              </span>
            </h2>

            <p className="text-lg text-slate-400 mb-8 leading-relaxed">
              Same workflow runs locally or on a remote GPU with no rewrites.
              NodeTool builds the container image and ships it to your provider
              of choice—RunPod, Google Cloud Run, Fly.io, Railway, or your own
              SSH host.
            </p>

            <div className="flex flex-col gap-6">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <Terminal className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">
                    One Command Deploy
                  </h3>
                  <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                    Simply run{" "}
                    <code className="bg-slate-800 px-1.5 py-0.5 rounded text-purple-300 text-xs font-mono border border-white/5">
                      nodetool deploy
                    </code>{" "}
                    to push your workflow to the cloud.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-pink-500/10 border border-pink-500/20">
                  <Zap className="w-5 h-5 text-pink-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">Serverless-Ready</h3>
                  <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                    Deploy to Google Cloud Run for native scale-to-zero, or to
                    RunPod serverless endpoints—pay only when your workflow
                    runs.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-10 pt-8 border-t border-white/5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
                Supported Providers
              </p>
              <div className="flex gap-8 grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-300">
                {/* RunPod */}
                <a
                  href="https://www.runpod.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 group"
                >
                  <Server className="w-5 h-5 text-purple-400 group-hover:scale-110 transition-transform" />
                  <span className="text-slate-300 font-medium group-hover:text-white transition-colors">
                    RunPod
                  </span>
                </a>
                {/* GCP */}
                <a
                  href="https://cloud.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 group"
                >
                  <Cloud className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                  <span className="text-slate-300 font-medium group-hover:text-white transition-colors">
                    Google Cloud
                  </span>
                </a>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Visual */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative hidden lg:block"
          >
            <Tilt3D>
              <div className="relative rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl p-6 shadow-2xl">
                {/* Mock Terminal Window */}
                <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                  <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
                  <div className="ml-auto text-xs text-slate-500 font-mono">
                    deploy.sh
                  </div>
                </div>

                <div className="font-mono text-sm space-y-3">
                  <div className="flex gap-2">
                    <span className="text-green-400">➜</span>
                    <span className="text-blue-400">~</span>
                    <span className="text-slate-300">
                      nodetool deploy --provider runpod
                    </span>
                  </div>
                  <div className="text-slate-500 pt-2">
                    [+] Building workflow graph...{" "}
                    <span className="text-green-400">Done</span>
                  </div>
                  <div className="text-slate-500">
                    [+] Provisioning GPU instance (RTX 4090)...{" "}
                    <span className="text-green-400">Done</span>
                  </div>
                  <div className="text-slate-500">
                    [+] Syncing models (2.4GB)...{" "}
                    <span className="text-green-400">Done</span>
                  </div>
                  <div className="text-slate-500 pb-2">
                    [+] Configuring endpoint...{" "}
                    <span className="text-green-400">Done</span>
                  </div>
                  <div className="text-purple-400 pt-2 border-t border-white/5">
                    🚀 Deployment active: <br />
                    <span className="underline opacity-80 hover:opacity-100 cursor-pointer">
                      https://your-endpoint.at.your-domain.com/
                    </span>
                  </div>
                </div>
              </div>

              {/* Floating Badge */}
              <motion.div
                className="absolute -right-6 -bottom-6 bg-slate-900/90 backdrop-blur-md border border-purple-500/30 p-4 rounded-xl shadow-xl shadow-purple-900/20"
                animate={{ y: [0, -10, 0] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                    <div className="absolute inset-0 w-3 h-3 bg-green-500 rounded-full animate-ping opacity-75" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Status</div>
                    <div className="text-sm font-semibold text-white">
                      Healthy (24ms)
                    </div>
                  </div>
                </div>
              </motion.div>
            </Tilt3D>
          </motion.div>
        </div>
      </div>
    </section>
  );
}



