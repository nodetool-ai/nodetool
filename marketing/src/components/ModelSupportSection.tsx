"use client";
import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Cpu, Zap, Layers, Box, Sparkles, Bot, ShieldCheck } from "lucide-react";
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
    { title: "MLX", url: "https://github.com/ml-explore/mlx", LogoComponent: MLXLogo, icon: Cpu },
    { title: "Ollama", url: "https://ollama.com", LogoComponent: OllamaLogo, icon: Box },
    { title: "llama.cpp", url: "https://github.com/ggml-org/llama.cpp", LogoComponent: LlamaCppLogo, icon: Zap },
    { title: "vLLM", url: "https://github.com/vllm-project/vllm", LogoComponent: null, icon: Layers },
    { title: "LM Studio", url: "https://lmstudio.ai", LogoComponent: null, icon: Box },
];

const cloudProviders = [
    { title: "OpenAI", url: "https://openai.com", LogoComponent: OpenAILogo, icon: null },
    { title: "Anthropic", url: "https://anthropic.com", LogoComponent: AnthropicLogo, icon: null },
    { title: "Google", url: "https://ai.google.dev", LogoComponent: GeminiLogo, icon: null },
    { title: "xAI", url: "https://x.ai", LogoComponent: null, icon: Bot },
    { title: "Mistral", url: "https://mistral.ai", LogoComponent: null, icon: Sparkles },
    { title: "Groq", url: "https://groq.com", LogoComponent: null, icon: Zap },
    { title: "DeepSeek", url: "https://deepseek.com", LogoComponent: null, icon: Bot },
    { title: "Meta AI", url: "https://dev.meta.ai", LogoComponent: null, icon: Zap },
    { title: "Cerebras", url: "https://cerebras.ai", LogoComponent: null, icon: Zap },
    { title: "GMI Cloud", url: "https://gmicloud.ai", LogoComponent: null, icon: Zap },
    { title: "Together", url: "https://together.ai", LogoComponent: null, icon: Layers },
    { title: "Kie.ai", url: "https://kie.ai", LogoComponent: null, icon: Sparkles },
    { title: "MiniMax", url: "https://www.minimaxi.com", LogoComponent: null, icon: ShieldCheck },
    { title: "Replicate", url: "https://replicate.com", LogoComponent: ReplicateLogo, icon: null },
    { title: "Fal AI", url: "https://fal.ai", LogoComponent: null, icon: Layers },
    { title: "OpenRouter", url: "https://openrouter.ai", LogoComponent: OpenRouterLogo, icon: null },
    { title: "HuggingFace", url: "https://huggingface.co", LogoComponent: HuggingFaceLogo, icon: null },
];

// Perishable by design: stale names here directly undercut the
// "swap models the day they launch" pitch — review on every release cycle.
const frontierModels = [
    { name: "GPT-5.6" },
    { name: "Claude Fable 5" },
    { name: "Claude Opus 5" },
    { name: "Claude Sonnet 5" },
    { name: "Gemini 3.5 Flash" },
    { name: "Gemini 3.1 Pro" },
    { name: "Qwen Image" },
    { name: "Veo 3.1" },
    { name: "Kling 3" },
    { name: "Seedance 3" },
    { name: "Hailuo 2.3" },
    { name: "Wan 2.5" },
    { name: "FLUX" },
    { name: "Whisper" },
    { name: "ElevenLabs" },
];

export default function ModelSupportSection({
    reducedMotion = false,
}: ModelSupportSectionProps) {
    const sectionRef = useRef<HTMLElement>(null);
    // Chrome cannot hand these marquees to the compositor, so every frame they
    // run costs a style recalculation over ~50 moving cards — measured at 1.2s
    // of the main thread per 3s on a 4x-throttled phone, whether or not the
    // section is on screen. That is the tax that made the rest of the page
    // (the hamburger menu among it) feel stuck. Run them only while visible.
    const [onScreen, setOnScreen] = useState(false);

    useEffect(() => {
        const section = sectionRef.current;
        if (!section || reducedMotion) return;
        const observer = new IntersectionObserver(
            ([entry]) => setOnScreen(entry.isIntersecting),
            { rootMargin: "200px" }
        );
        observer.observe(section);
        return () => observer.disconnect();
    }, [reducedMotion]);

    const marqueesRunning = onScreen && !reducedMotion;

    return (
        <section
            ref={sectionRef}
            aria-labelledby="model-support-title"
            className={`relative py-16 overflow-clip-safe${
                marqueesRunning ? "" : " marquees-paused"
            }`}
        >
            <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
                {/* Header */}
                <div className="scroll-fade mb-12 text-center max-w-3xl mx-auto">
                    <p className="mb-4 text-sm font-medium text-amber-300">
                        Models
                    </p>

                    <motion.h2
                        id="model-support-title"
                        initial={false}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.25 }}
                        className="text-3xl md:text-5xl font-semibold tracking-tight text-slate-100 mb-6"
                    >
                        Every model you need.{" "}
                        <span className="text-slate-400">On your own keys.</span>
                    </motion.h2>

                    <motion.p
                        initial={false}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.25, delay: 0.05 }}
                        className="text-lg text-slate-300 leading-relaxed"
                    >
                        Route your shots through the best video, image, audio,
                        and language models, or run open weights on your own
                        hardware. Switch in one click. Pay each provider
                        directly, at their published price.
                    </motion.p>
                </div>

                {/* Frontier Models Marquee */}
                <div className="mb-10">
                    <p className="mb-4 text-center text-sm font-medium text-slate-400">Latest models</p>

                    <div className="relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-950 to-transparent z-10 pointer-events-none" />
                        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-950 to-transparent z-10 pointer-events-none" />

                        <div className="flex animate-marquee-models hover:[animation-play-state:paused]">
                            {[...frontierModels, ...frontierModels].map((model, idx) => (
                                <span
                                    key={`${model.name}-${idx}`}
                                    aria-hidden={idx >= frontierModels.length || undefined}
                                    className={`flex-shrink-0 mx-4 text-lg font-medium whitespace-nowrap text-slate-300`}
                                >
                                    {model.name}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Cloud Providers Marquee */}
                <div className="mb-8">
                    <p className="mb-4 text-sm font-medium text-slate-400">Cloud providers</p>

                    <div className="relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-950 to-transparent z-10 pointer-events-none" />
                        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-950 to-transparent z-10 pointer-events-none" />

                        <div className="flex animate-marquee hover:[animation-play-state:paused]">
                            {[...cloudProviders, ...cloudProviders].map((provider, idx) => (
                                <a
                                    key={`${provider.title}-${idx}`}
                                    aria-hidden={idx >= cloudProviders.length || undefined}
                                    tabIndex={idx >= cloudProviders.length ? -1 : undefined}
                                    href={provider.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex-shrink-0 flex items-center gap-2 mx-2 px-4 py-2 rounded-full border border-white/10 bg-white/[0.03] transition-colors hover:border-white/25 hover:bg-white/[0.06]`}
                                >
                                    {provider.LogoComponent ? (
                                        <provider.LogoComponent className="text-slate-300" size={18} />
                                    ) : provider.icon ? (
                                        <provider.icon className="w-4 h-4 text-slate-400" />
                                    ) : null}
                                    <span className="text-slate-200 text-sm font-medium whitespace-nowrap">{provider.title}</span>
                                </a>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Local Inference Marquee (reverse direction) */}
                <div>
                    <p className="mb-4 text-sm font-medium text-slate-400">Runs on your machine</p>

                    <div className="relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-950 to-transparent z-10 pointer-events-none" />
                        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-950 to-transparent z-10 pointer-events-none" />

                        <div className="flex animate-marquee-reverse hover:[animation-play-state:paused]">
                            {[...localEngines, ...localEngines, ...localEngines, ...localEngines].map((engine, idx) => (
                                <a
                                    key={`${engine.title}-${idx}`}
                                    aria-hidden={idx >= localEngines.length || undefined}
                                    tabIndex={idx >= localEngines.length ? -1 : undefined}
                                    href={engine.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`flex-shrink-0 flex items-center gap-2 mx-2 px-4 py-2 rounded-full border border-white/10 bg-white/[0.03] transition-colors hover:border-white/25 hover:bg-white/[0.06]`}
                                >
                                    {engine.LogoComponent ? (
                                        <engine.LogoComponent className="text-slate-300" size={18} />
                                    ) : (
                                        <engine.icon className="w-4 h-4 text-slate-400" />
                                    )}
                                    <span className="text-slate-200 text-sm font-medium whitespace-nowrap">{engine.title}</span>
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
                .marquees-paused .animate-marquee,
                .marquees-paused .animate-marquee-reverse,
                .marquees-paused .animate-marquee-models {
                    animation-play-state: paused;
                }
            `}</style>
        </section>
    );
}
