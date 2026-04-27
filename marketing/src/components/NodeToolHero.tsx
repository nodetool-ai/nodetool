import React, { useRef, useState, useEffect, useMemo } from "react";
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from "framer-motion";
import { Brain, Volume2, Eye, Search, Activity, Command, Download } from "lucide-react";
import { SmartDownloadButton } from "../app/SmartDownloadButton";

// --- Types & Config ---

type Hue = "sky" | "teal" | "emerald" | "amber" | "rose" | "blue";

interface NodeData {
  id: string;
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  title: string;
  icon: React.ElementType;
  hue: Hue;
  inputs?: string[];
  meta: { label: string; value: string }[];
}

// Coordinate system for the graph
// Adjusted positions for a clean Left -> Right flow with ample spacing
const NODES: NodeData[] = [
  {
    id: "agent",
    x: 18,
    y: 50,
    title: "AI Agent",
    icon: Brain,
    hue: "sky",
    meta: [{ label: "Model", value: "GPT-OSS 20B" }, { label: "Task", value: "Summarize" }]
  },
  {
    id: "search",
    x: 50,
    y: 75,
    title: "Web Search",
    icon: Search,
    hue: "emerald",
    inputs: ["agent"],
    meta: [{ label: "Query", value: "Latest AI News" }]
  },
  {
    id: "tts",
    x: 50,
    y: 25,
    title: "Text to Speech",
    icon: Volume2,
    hue: "teal",
    inputs: ["agent"],
    meta: [{ label: "Voice", value: "Alloy" }, { label: "Speed", value: "1.0x" }]
  },
  {
    id: "player",
    x: 82,
    y: 50,
    title: "Audio Player",
    icon: Eye,
    hue: "rose",
    inputs: ["tts", "search"],
    meta: [{ label: "Status", value: "Playing" }]
  }
];

// --- Components ---

export default function NodeToolHero() {
  return (
    <div className="w-full bg-[#05050A] text-slate-200 selection:bg-blue-500/30 overflow-x-hidden">

      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-blue-500 opacity-20 blur-[100px]"></div>
        <div className="absolute right-0 bottom-0 -z-10 h-[400px] w-[400px] rounded-full bg-teal-500 opacity-10 blur-[120px]"></div>
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6 pt-12 pb-6 lg:pt-16">
        {/* Header Section */}
        <div className="mx-auto max-w-3xl text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-sm font-medium tracking-wider uppercase text-blue-400 mb-4">
              Open-Source Node-Based AI Development Tool
            </p>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-8">
              Build AI Workflows <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-300">
                with Visual Nodes
              </span>
            </h1>

            <p className="text-lg md:text-xl text-slate-400 mb-6 leading-relaxed max-w-2xl mx-auto">
              NodeTool is a visual programming tool for AI development. Connect nodes to build LLM agents, 
              RAG systems, and multimodal pipelines. Runs locally on macOS, Windows, and Linux. 
              Use local models or cloud APIs. Your data stays on your machine.
            </p>

            {/* Alpha Notice */}
            <div className="mb-6 flex items-center justify-center gap-3 text-sm">
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-medium text-xs uppercase tracking-wide">Alpha</span>
              <span className="text-slate-400">Expect rough edges.</span>
              <a 
                href="https://discord.gg/WmQTWZRcYE" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors font-medium"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                Join Discord
              </a>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <SmartDownloadButton
                icon={<Download className="w-5 h-5" />}
                classNameOverride="px-8 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 transition-all shadow-lg shadow-blue-900/40 flex items-center gap-2"
              />
            </div>

            <div className="mt-8 flex items-center justify-center gap-6 text-sm text-slate-500 font-medium">
              <span className="flex items-center gap-2"><Command className="w-4 h-4" /> Open Source</span>
              <span className="w-1 h-1 rounded-full bg-slate-700" />
              <span>macOS, Windows & Linux</span>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function GraphVisualization() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000); // Default to reasonable desktop width

  // Track container width to calculate exact handle positions
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
        {/* Inner Glow Gradient that follows mouse */}
        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
          <motion.div
            className="absolute -inset-full opacity-40 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.15)_0%,transparent_50%)]"
            style={{
              x: useTransform(mouseX, [-0.5, 0.5], ["-20%", "20%"]),
              y: useTransform(mouseY, [-0.5, 0.5], ["-20%", "20%"]),
            }}
          />
        </div>

        {/* The Actual Graph Content */}
        <div className="absolute inset-0 p-8 sm:p-12 md:p-16">
          <div className="relative w-full h-full transform-style-3d">
            {/* Connections Layer (Bottom) */}
            <Connections containerWidth={width} />

            {/* Nodes Layer (Top) */}
            {NODES.map((node, i) => (
              <Node key={node.id} data={node} index={i} />
            ))}
          </div>
        </div>

        {/* Decorative UI overlays */}
        <div className="absolute top-6 left-6 flex gap-2">
          <div className="h-3 w-3 rounded-full bg-red-500/20 border border-red-500/50" />
          <div className="h-3 w-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
          <div className="h-3 w-3 rounded-full bg-green-500/20 border border-green-500/50" />
        </div>

        <div className="absolute bottom-6 right-8 text-xs font-mono text-slate-500 uppercase tracking-widest">
          Pipeline Active • 24ms Latency
        </div>

      </motion.div>
    </div>
  );
}

function Connections({ containerWidth }: { containerWidth: number }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="gradient-sky" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0" />
          <stop offset="50%" stopColor="#0ea5e9" stopOpacity="1" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gradient-violet" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0" />
          <stop offset="50%" stopColor="#8b5cf6" stopOpacity="1" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gradient-emerald" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
          <stop offset="50%" stopColor="#10b981" stopOpacity="1" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>

      {NODES.map(node => {
        if (!node.inputs) return null;
        return node.inputs.map(inputId => {
          const inputNode = NODES.find(n => n.id === inputId);
          if (!inputNode) return null;
          return (
            <ConnectionLine
              key={`${inputId}-${node.id}`}
              from={inputNode}
              to={node}
              containerWidth={containerWidth}
            />
          );
        });
      })}
    </svg>
  );
}

function ConnectionLine({ from, to, containerWidth }: { from: NodeData; to: NodeData, containerWidth: number }) {
  // --- Exact Handle Calculation ---

  // 1. Determine Node Width in Pixels (matches CSS logic)
  // Logic: w-[180px] on mobile (<768px), md:w-[220px] on desktop
  const isMobile = containerWidth < 768;
  const nodeWidthPx = isMobile ? 180 : 220;

  // 2. Convert to Percentage relative to container
  // We divide by 2 because 'x' is the center, so handle is at center +/- half_width
  const halfWidthPct = ((nodeWidthPx / 2) / containerWidth) * 100;

  // 3. Calculate start (Right Handle of Source) and end (Left Handle of Target)
  const startX = from.x + halfWidthPct;
  const startY = from.y;
  const endX = to.x - halfWidthPct;
  const endY = to.y;

  // Control points for nice S-curve (Bezier)
  const distX = endX - startX;
  const cp1x = startX + (distX * 0.5);
  const cp1y = startY;
  const cp2x = endX - (distX * 0.5);
  const cp2y = endY;

  const pathData = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;

  return (
    <g>
      {/* Background track */}
      <path
        d={pathData}
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />

      {/* Moving Data Packet (Unidirectional Flow) */}
      <motion.path
        d={pathData}
        fill="none"
        stroke={`url(#gradient-${from.hue})`}
        strokeWidth="3"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        initial={{ strokeDasharray: "0 1", pathLength: 0.3, strokeDashoffset: 0, opacity: 0 }}
        animate={{
          pathLength: [0.1, 0.3, 0.1], // Pulse length
          strokeDashoffset: [0, -1], // Moves forward along the path
          opacity: [0, 1, 0] // Fade in/out
        }}
        transition={{
          duration: 2.5,
          repeat: Infinity,
          ease: "linear",
          delay: Math.random() * 1.5,
          times: [0, 0.5, 1]
        }}
        // Using pathLength 1 means dashoffset 1 traverses whole path
        style={{ pathLength: 1 }}
      />
    </g>
  )
}

function Node({ data, index }: { data: NodeData, index: number }) {
  const Icon = data.icon;

  // Color maps
  const colors = {
    sky: { bg: "bg-sky-500", text: "text-sky-300", border: "border-sky-500/30", glow: "shadow-sky-500/20" },
    teal: { bg: "bg-teal-500", text: "text-teal-300", border: "border-teal-500/30", glow: "shadow-teal-500/20" },
    emerald: { bg: "bg-emerald-500", text: "text-emerald-300", border: "border-emerald-500/30", glow: "shadow-emerald-500/20" },
    rose: { bg: "bg-rose-500", text: "text-rose-300", border: "border-rose-500/30", glow: "shadow-rose-500/20" },
    amber: { bg: "bg-amber-500", text: "text-amber-300", border: "border-amber-500/30", glow: "shadow-amber-500/20" },
    blue: { bg: "bg-blue-500", text: "text-blue-300", border: "border-blue-500/30", glow: "shadow-blue-500/20" },
  };

  const theme = colors[data.hue];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, z: 0 }}
      animate={{ opacity: 1, scale: 1, z: 20 }}
      transition={{ delay: 0.2 + (index * 0.1), duration: 0.5 }}
      style={{
        left: `${data.x}%`,
        top: `${data.y}%`,
        x: "-50%",
        y: "-50%",
      }}
      className={`absolute w-[180px] md:w-[220px] rounded-2xl border bg-[#0F111A]/90 backdrop-blur-md p-4 shadow-xl ${theme.border} ${theme.glow} hover:scale-105 transition-transform duration-300 group`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${theme.bg} bg-opacity-10 ring-1 ring-inset ring-white/10`}>
          <Icon className={`h-5 w-5 ${theme.text}`} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white leading-tight">{data.title}</h3>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {data.id}</p>
        </div>
      </div>

      <div className="space-y-2">
        {data.meta.map((item, i) => (
          <div key={i} className="flex justify-between text-xs items-center p-1.5 rounded bg-white/5 border border-white/5">
            <span className="text-slate-500">{item.label}</span>
            <span className="text-slate-300 font-medium">{item.value}</span>
          </div>
        ))}
        {data.id === 'player' && <SpectrumAnalyzer hue={data.hue} />}
      </div>

      {/* Connection Handle: INPUT (Left) */}
      <div className={`absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-slate-700 bg-[#0F111A] ring-2 ring-[#0F111A] ${data.inputs ? 'opacity-100' : 'opacity-0'}`}>
        <div className={`h-full w-full rounded-full ${theme.bg} opacity-50`} />
      </div>

      {/* Connection Handle: OUTPUT (Right) */}
      <div className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-slate-700 bg-[#0F111A] ring-2 ring-[#0F111A]">
        <div className={`h-full w-full rounded-full ${theme.bg}`} />
      </div>
    </motion.div>
  );
}

function SpectrumAnalyzer({ hue }: { hue: Hue }) {
  const bars = 12;

  // Tailwinds dynamic colors
  const bgMap = {
    sky: "bg-sky-400",
    teal: "bg-teal-400",
    emerald: "bg-emerald-400",
    rose: "bg-rose-400",
    amber: "bg-amber-400",
    blue: "bg-blue-400",
  }

  return (
    <div className="flex h-8 items-end justify-between gap-0.5 mt-3 px-1">
      {Array.from({ length: bars }).map((_, i) => (
        <motion.div
          key={i}
          className={`w-full rounded-full ${bgMap[hue]}`}
          initial={{ height: "20%" }}
          animate={{
            height: ["20%", `${Math.random() * 80 + 20}%`, "20%"]
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            repeatType: "reverse",
            delay: i * 0.05,
            ease: "easeInOut"
          }}
          style={{ opacity: 0.8 }}
        />
      ))}
    </div>
  )
}
