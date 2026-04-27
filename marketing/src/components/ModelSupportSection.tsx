"use client";
import React from "react";
import { motion } from "framer-motion";
import { Cpu, Zap, Layers, Box, Sparkles, Cloud, Globe, Bot, ShieldCheck } from "lucide-react";
import {
    OpenAILogo,
    AnthropicLogo,
    GeminiLogo,
    OllamaLogo,
    LlamaCppLogo,
    MLXLogo,
    ReplicateLogo,
    HuggingFaceLogo,
    OpenRouterLogo,
} from "./icons/ProviderLogos";

interface ModelSupportSectionProps {
    reducedMotion?: boolean;
}

const localEngines = [
    { title: "MLX", url: "https://github.com/ml-explore/mlx", LogoComponent: MLXLogo, icon: Cpu, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
    { title: "Ollama", url: "https://ollama.com", LogoComponent: OllamaLogo, icon: Box, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
    { title: "llama.cpp", url: "https://github.com/ggml-org/llama.cpp", LogoComponent: LlamaCppLogo, icon: Zap, color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
    { title: "vLLM", url: "https://github.com/vllm-project/vllm", LogoComponent: null, icon: Layers, color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
    { title: "Nunchaku", url: "https://github.com/nunchaku-tech/nunchaku", LogoComponent: null, icon: Sparkles, color: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/20" },
];

const cloudProviders = [
    { title: "OpenAI", url: "https://openai.com", LogoComponent: OpenAILogo, icon: null, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
    { title: "Anthropic", url: "https://anthropic.com", LogoComponent: AnthropicLogo, icon: null, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
    { title: "Google", url: "https://ai.google.dev", LogoComponent: GeminiLogo, icon: null, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
    { title: "xAI", url: "https://x.ai", LogoComponent: null, icon: Bot, color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
    { title: "Kie.ai", url: "https://kie.ai", LogoComponent: null, icon: Sparkles, color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
    { title: "z.ai", url: "https://z.ai", LogoComponent: null, icon: Zap, color: "text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/20" },
    { title: "Black Forest Labs", url: "https://blackforestlabs.ai", LogoComponent: null, icon: Sparkles, color: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/20" },
    { title: "Alibaba", url: "https://www.alibabacloud.com", LogoComponent: null, icon: Globe, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
    { title: "MiniMax", url: "https://www.minimaxi.com", LogoComponent: null, icon: ShieldCheck, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
    { title: "Kling", url: "https://kling.kuaishou.com", LogoComponent: null, icon: Zap, color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
    { title: "Replicate", url: "https://replicate.com", LogoComponent: ReplicateLogo, icon: null, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
    { title: "Fal AI", url: "https://fal.ai", LogoComponent: null, icon: Layers, color: "text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/20" },
    { title: "OpenRouter", url: "https://openrouter.ai", LogoComponent: OpenRouterLogo, icon: null, color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20" },
    { title: "HuggingFace", url: "https://huggingface.co", LogoComponent: HuggingFaceLogo, icon: null, color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
];

const frontierModels = [
    { name: "GPT-5.4", color: "text-emerald-400" },
    { name: "Claude 4.5 Opus", color: "text-amber-400" },
    { name: "Claude 4.5 Sonnet", color: "text-amber-400" },
    { name: "Gemini 3.0 Flash", color: "text-blue-400" },
    { name: "Gemini 3.0 Pro", color: "text-blue-400" },
    { name: "Kimi K 2.5", color: "text-orange-400" },
    { name: "GLM 5.1", color: "text-red-400" },
    { name: "MiniMax M2.7", color: "text-teal-400" },
    { name: "FLUX.2 Pro", color: "text-pink-400" },
    { name: "gpt-image-1.5", color: "text-emerald-400" },
    { name: "Qwen Image", color: "text-sky-400" },
    { name: "Sora 2", color: "text-emerald-400" },
    { name: "Veo 3", color: "text-blue-400" },
    { name: "Seedance 2.0", color: "text-green-400" },
    { name: "Kling 3.0", color: "text-cyan-400" },
    { name: "Hailuo 2.3", color: "text-red-400" },
    { name: "LTX 2", color: "text-orange-400" },
    { name: "Qwen 3", color: "text-sky-400" },
    { name: "Whisper", color: "text-emerald-400" },
    { name: "ElevenLabs", color: "text-violet-400" },
];

export default function ModelSupportSection({
    reducedMotion = false,
}: ModelSupportSectionProps) {
    return (
        <section
            aria-labelledby="model-support-title"
            className="relative py-16 overflow-hidden"
        >
            {/* Background Glow */}
            <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[800px] h-[500px] bg-emerald-900/20 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[800px] h-[500px] bg-blue-900/20 blur-[120px] rounded-full pointer-events-none" />

            <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
                {/* Header */}
                <div className="mb-12 text-center max-w-3xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 shadow-lg shadow-emerald-500/5"
                    >
                        <Zap className="w-8 h-8 text-emerald-400" />
                    </motion.div>

                    <motion.h2
                        id="model-support-title"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6"
                    >
                        Run Any Model,{" "}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-400 to-blue-400">
                            Anywhere
                        </span>
                    </motion.h2>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="text-lg text-slate-400 leading-relaxed"
                    >
                        Access frontier models from leading cloud providers or run models locally with complete privacy.
                    </motion.p>
                </div>

                {/* Frontier Models Marquee */}
                <div className="mb-10">
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <Sparkles className="w-5 h-5 text-violet-400" />
                        <span className="text-sm font-medium text-slate-400">Frontier Models</span>
                    </div>

                    <div className="relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-950 to-transparent z-10 pointer-events-none" />
                        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-950 to-transparent z-10 pointer-events-none" />

                        <div className="flex animate-marquee-models hover:[animation-play-state:paused]">
                            {[...frontierModels, ...frontierModels].map((model, idx) => (
                                <span
                                    key={`${model.name}-${idx}`}
                                    className={`flex-shrink-0 mx-4 text-lg font-semibold whitespace-nowrap ${model.color}`}
                                >
                                    {model.name}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Cloud Providers Marquee */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-4">
                        <Cloud className="w-5 h-5 text-blue-400" />
                        <span className="text-sm font-medium text-slate-400">Cloud Providers</span>
                    </div>

                    <div className="relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-950 to-transparent z-10 pointer-events-none" />
                        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-950 to-transparent z-10 pointer-events-none" />

                        <div className="flex animate-marquee hover:[animation-play-state:paused]">
                            {[...cloudProviders, ...cloudProviders].map((provider, idx) => (
                                <a
                                    key={`${provider.title}-${idx}`}
                                    href={provider.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex-shrink-0 flex items-center gap-2 mx-2 px-4 py-2 rounded-lg border ${provider.border} ${provider.bg} backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-lg`}
                                >
                                    {provider.LogoComponent ? (
                                        <provider.LogoComponent className={provider.color} size={18} />
                                    ) : provider.icon ? (
                                        <provider.icon className={`w-4 h-4 ${provider.color}`} />
                                    ) : null}
                                    <span className="text-white text-sm font-medium whitespace-nowrap">{provider.title}</span>
                                </a>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Local Inference Marquee (reverse direction) */}
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <Cpu className="w-5 h-5 text-emerald-400" />
                        <span className="text-sm font-medium text-slate-400">Local Inference</span>
                    </div>

                    <div className="relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-950 to-transparent z-10 pointer-events-none" />
                        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-950 to-transparent z-10 pointer-events-none" />

                        <div className="flex animate-marquee-reverse hover:[animation-play-state:paused]">
                            {[...localEngines, ...localEngines, ...localEngines, ...localEngines].map((engine, idx) => (
                                <a
                                    key={`${engine.title}-${idx}`}
                                    href={engine.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex-shrink-0 flex items-center gap-2 mx-2 px-4 py-2 rounded-lg border ${engine.border} ${engine.bg} backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-lg`}
                                >
                                    {engine.LogoComponent ? (
                                        <engine.LogoComponent className={engine.color} size={18} />
                                    ) : (
                                        <engine.icon className={`w-4 h-4 ${engine.color}`} />
                                    )}
                                    <span className="text-white text-sm font-medium whitespace-nowrap">{engine.title}</span>
                                </a>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <style jsx>{`
                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                @keyframes marquee-reverse {
                    0% { transform: translateX(-50%); }
                    100% { transform: translateX(0); }
                }
                @keyframes marquee-models {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
                .animate-marquee {
                    animation: marquee 40s linear infinite;
                }
                .animate-marquee-reverse {
                    animation: marquee-reverse 30s linear infinite;
                }
                .animate-marquee-models {
                    animation: marquee-models 25s linear infinite;
                }
            `}</style>
        </section>
    );
}
