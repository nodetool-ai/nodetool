import React, { useRef, useState, useEffect } from "react";
import {
    motion,
    useMotionValue,
    useSpring,
    useTransform,
} from "framer-motion";
import { Brain, Search, Terminal, MessageSquare, Database, Command, Globe, Download } from "lucide-react";
import { SmartDownloadButton } from "../../app/SmartDownloadButton";

// --- Types & Config ---

type Hue = "sky" | "teal" | "emerald" | "amber" | "rose" | "blue" | "orange";

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
// Adjusted for an Agentic flow: User Input -> Planner -> Tools -> Response
const NODES: NodeData[] = [
    {
        id: "user_input",
        x: 10, // Far left
        y: 50,
        title: "User Input",
        icon: MessageSquare,
        hue: "sky",
        meta: [{ label: "Type", value: "Chat" }, { label: "Query", value: "Research AI" }]
    },
    {
        id: "planner",
        x: 35,
        y: 50,
        title: "Supervisor Agent",
        icon: Brain,
        hue: "teal",
        inputs: ["user_input"],
        meta: [{ label: "Model", value: "GPT-5.4" }, { label: "Role", value: "Orchestrator" }]
    },
    {
        id: "web_search",
        x: 65,
        y: 25,
        title: "Web Search",
        icon: Search,
        hue: "emerald",
        inputs: ["planner"],
        meta: [{ label: "Tool", value: "Google" }]
    },
    {
        id: "database",
        x: 65,
        y: 75,
        title: "Knowledge Base",
        icon: Database,
        hue: "amber",
        inputs: ["planner"],
        meta: [{ label: "Source", value: "Vector DB" }]
    },
    {
        id: "response",
        x: 90,
        y: 50,
        title: "Final Answer",
        icon: Terminal,
        hue: "rose",
        inputs: ["web_search", "database"],
        meta: [{ label: "Format", value: "Markdown" }]
    }
];

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
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-500/10 border border-teal-500/20 mb-6">
                            <Brain className="w-4 h-4 text-amber-400" />
                            <span className="text-sm font-medium text-amber-300">
                                Agentic Workflows
                            </span>
                        </div>

                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-8">
                            Build Autonomous <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-fuchsia-400 to-rose-400">
                                AI Agents Visually
                            </span>
                        </h1>

                        <p className="text-lg md:text-xl text-slate-400 mb-10 leading-relaxed max-w-2xl mx-auto">
                            Orchestrate multi-step reasoning loops. Connect LLMs to tools, databases, and APIs.
                            Debug agent thoughts in real-time.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <a href="https://docs.nodetool.ai" className="px-8 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-500 hover:to-indigo-500 transition-all shadow-lg shadow-teal-900/40 flex items-center gap-2">
                                Get Started
                            </a>
                            <SmartDownloadButton
                                icon={<Download className="w-5 h-5" />}
                                classNameOverride="px-8 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-all shadow-lg shadow-emerald-900/40 flex items-center gap-2"
                            />
                        </div>

                        <div className="mt-8 flex items-center justify-center gap-6 text-sm text-slate-500 font-medium">
                            <span className="flex items-center gap-2"><Command className="w-4 h-4" /> Open Source</span>
                            <span className="w-1 h-1 rounded-full bg-slate-700" />
                            <span>Full Observability</span>
                        </div>
                    </motion.div>
                </div>

                {/* The Visualization Stage */}
                <GraphVisualization />

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
                        className="absolute -inset-full opacity-40 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.15)_0%,transparent_50%)]"
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
                    Agent Reasoning • Step 3/5
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
                <linearGradient id="gradient-amber" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0" />
                    <stop offset="50%" stopColor="#f59e0b" stopOpacity="1" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="gradient-rose" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0" />
                    <stop offset="50%" stopColor="#f43f5e" stopOpacity="1" />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
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
    // Logic: w-[160px] on mobile (<768px), md:w-[200px] on desktop - slightly smaller than main hero nodes
    const isMobile = containerWidth < 768;
    const nodeWidthPx = isMobile ? 160 : 200;

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
        amber: { bg: "bg-amber-500", text: "text-amber-300", border: "border-amber-500/30", glow: "shadow-amber-500/20" },
        blue: { bg: "bg-blue-500", text: "text-blue-300", border: "border-blue-500/30", glow: "shadow-blue-500/20" },
        rose: { bg: "bg-rose-500", text: "text-rose-300", border: "border-rose-500/30", glow: "shadow-rose-500/20" },
        orange: { bg: "bg-orange-500", text: "text-orange-300", border: "border-orange-500/30", glow: "shadow-orange-500/20" },
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
            className={`absolute w-[160px] md:w-[200px] rounded-2xl border bg-[#0F111A]/90 backdrop-blur-md p-4 shadow-xl ${theme.border} ${theme.glow} hover:scale-105 transition-transform duration-300 group`}
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
