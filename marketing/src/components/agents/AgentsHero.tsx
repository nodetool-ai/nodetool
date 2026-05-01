"use client";
import React, { useRef, useState, useEffect } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  Bot,
  Sparkles,
  Workflow,
  Zap,
  Command,
} from "lucide-react";

export default function AgentsHero() {
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-500/10 border border-teal-500/20 mb-6">
              <Bot className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-amber-300">
                AI Agents & Automation
              </span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-8">
              Build Intelligent
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-blue-400 to-cyan-400">
                AI Agents
              </span>
            </h1>

            <p className="text-lg md:text-xl text-slate-400 mb-10 leading-relaxed max-w-2xl mx-auto">
              Create autonomous agents that reason, plan, and execute complex
              tasks. Chain together AI models, tools, and APIs to automate
              anything—all with a visual drag-and-drop interface.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://docs.nodetool.ai"
                className="px-8 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-teal-600 to-blue-600 hover:from-teal-500 hover:to-blue-500 transition-all shadow-lg shadow-teal-900/40 flex items-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                Get Started
              </a>
              <a
                href="#use-cases"
                className="px-8 py-4 rounded-xl font-semibold text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex items-center gap-2"
              >
                See Use Cases
              </a>
            </div>

            <div className="mt-8 flex items-center justify-center gap-6 text-sm text-slate-500 font-medium">
              <span className="flex items-center gap-2">
                <Command className="w-4 h-4" /> Open Source
              </span>
              <span className="w-1 h-1 rounded-full bg-slate-700" />
              <span className="flex items-center gap-2">
                <Zap className="w-4 h-4" /> No Code Required
              </span>
              <span className="w-1 h-1 rounded-full bg-slate-700" />
              <span className="flex items-center gap-2">
                <Workflow className="w-4 h-4" /> Visual Builder
              </span>
            </div>
          </motion.div>
        </div>

        {/* The Visualization Stage */}
        <AgentVisualization />
      </div>
    </div>
  );
}

function AgentVisualization() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // 3D Tilt Logic
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseX = useSpring(x, { stiffness: 150, damping: 15 });
  const mouseY = useSpring(y, { stiffness: 150, damping: 15 });

  const rotateX = useTransform(mouseY, [-0.5, 0.5], ["7deg", "-7deg"]);
  const rotateY = useTransform(mouseX, [-0.5, 0.5], ["-7deg", "7deg"]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const mouseXVal = (e.clientX - rect.left) / w - 0.5;
    const mouseYVal = (e.clientY - rect.top) / h - 0.5;
    x.set(mouseXVal);
    y.set(mouseYVal);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <div
      style={{ perspective: 1200 }}
      className="w-full relative flex justify-center"
    >
      <motion.div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
        className="relative w-full max-w-5xl aspect-[16/8] md:aspect-[16/7] rounded-3xl border border-white/10 bg-slate-900/40 backdrop-blur-xl shadow-2xl"
      >
        {/* Inner Glow */}
        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
          <motion.div
            className="absolute -inset-full opacity-40 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.15)_0%,transparent_50%)]"
            style={{
              x: useTransform(mouseX, [-0.5, 0.5], ["-20%", "20%"]),
              y: useTransform(mouseY, [-0.5, 0.5], ["-20%", "20%"]),
            }}
          />
        </div>

        {/* Agent Pipeline Content */}
        <div className="absolute inset-0 p-8 sm:p-12 md:p-16">
          <AgentPipeline containerWidth={width} />
        </div>

        {/* Decorative UI overlays */}
        <div className="absolute top-6 left-6 flex gap-2">
          <div className="h-3 w-3 rounded-full bg-red-500/20 border border-red-500/50" />
          <div className="h-3 w-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
          <div className="h-3 w-3 rounded-full bg-green-500/20 border border-green-500/50" />
        </div>

        <div className="absolute bottom-6 right-8 text-xs font-mono text-slate-500 uppercase tracking-widest">
          Agent Active • Reasoning...
        </div>
      </motion.div>
    </div>
  );
}

// Agent Pipeline shows a multi-step agent workflow
function AgentPipeline({ containerWidth }: { containerWidth: number }) {
  const steps = [
    {
      id: "input",
      label: "User Query",
      icon: "💬",
      color: "violet",
      x: 12,
      y: 50,
    },
    {
      id: "planner",
      label: "Planner",
      icon: "🧠",
      color: "blue",
      x: 35,
      y: 30,
    },
    {
      id: "tools",
      label: "Tool Selector",
      icon: "🔧",
      color: "cyan",
      x: 35,
      y: 70,
    },
    {
      id: "executor",
      label: "Executor",
      icon: "⚡",
      color: "emerald",
      x: 60,
      y: 50,
    },
    {
      id: "output",
      label: "Response",
      icon: "✅",
      color: "green",
      x: 88,
      y: 50,
    },
  ];

  const connections = [
    { from: "input", to: "planner" },
    { from: "input", to: "tools" },
    { from: "planner", to: "executor" },
    { from: "tools", to: "executor" },
    { from: "executor", to: "output" },
  ];

  const getStepById = (id: string) => steps.find((s) => s.id === id);

  return (
    <div className="relative w-full h-full">
      {/* Connections */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient
            id="connection-gradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.3" />
            <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        {connections.map(({ from, to }) => {
          const fromStep = getStepById(from);
          const toStep = getStepById(to);
          if (!fromStep || !toStep) return null;

          const startX = fromStep.x + 5;
          const startY = fromStep.y;
          const endX = toStep.x - 5;
          const endY = toStep.y;

          const distX = endX - startX;
          const cp1x = startX + distX * 0.5;
          const cp1y = startY;
          const cp2x = endX - distX * 0.5;
          const cp2y = endY;

          const pathData = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;

          return (
            <g key={`${from}-${to}`}>
              <path
                d={pathData}
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              <motion.path
                d={pathData}
                fill="none"
                stroke="url(#connection-gradient)"
                strokeWidth="3"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: [0.1, 0.3, 0.1],
                  strokeDashoffset: [0, -1],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: 2.5,
                  repeat: Infinity,
                  ease: "linear",
                  delay: Math.random() * 1.5,
                }}
                style={{ pathLength: 1 }}
              />
            </g>
          );
        })}
      </svg>

      {/* Nodes */}
      {steps.map((step, index) => (
        <motion.div
          key={step.id}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 + index * 0.1, duration: 0.5 }}
          style={{
            left: `${step.x}%`,
            top: `${step.y}%`,
            transform: "translate(-50%, -50%)",
          }}
          className="absolute"
        >
          <div
            className={`
            relative px-4 py-3 rounded-xl border bg-[#0F111A]/90 backdrop-blur-md shadow-xl
            transition-transform duration-300 hover:scale-105
            ${
              step.color === "violet"
                ? "border-teal-500/30 shadow-teal-500/20"
                : ""
            }
            ${
              step.color === "blue"
                ? "border-blue-500/30 shadow-blue-500/20"
                : ""
            }
            ${
              step.color === "cyan"
                ? "border-cyan-500/30 shadow-cyan-500/20"
                : ""
            }
            ${
              step.color === "emerald"
                ? "border-emerald-500/30 shadow-emerald-500/20"
                : ""
            }
            ${
              step.color === "green"
                ? "border-green-500/30 shadow-green-500/20"
                : ""
            }
          `}
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">{step.icon}</span>
              <span className="text-sm font-medium text-white whitespace-nowrap">
                {step.label}
              </span>
            </div>
            {/* Pulse indicator for active step */}
            {step.id === "executor" && (
              <div className="absolute -right-1 -top-1">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              </div>
            )}
          </div>
        </motion.div>
      ))}

      {/* Central "thinking" indicator */}
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      >
        <div className="w-24 h-24 rounded-full border border-dashed border-teal-500/20" />
      </motion.div>
    </div>
  );
}
