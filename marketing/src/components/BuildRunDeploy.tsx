import React, { useEffect, useRef, useState } from "react";
import { Terminal, Box, Zap, Check, Globe, Cpu, Layers, ArrowRight, Image as ImageIcon } from "lucide-react";

type AccentColor = "blue" | "purple" | "emerald";

interface CardProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  step: number;
  accentColor: AccentColor;
}

export default function BuildRunDeploy() {
  return (
    <div className="min-h-screen bg-[#0B0C10] py-20 px-4 flex items-center justify-center font-sans overflow-hidden relative">
      {/* Background Ambience */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl mix-blend-screen" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl mix-blend-screen" />
      </div>

      <div className="relative mx-auto max-w-6xl w-full z-10">
        <div className="mb-12 text-center max-w-2xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400 mb-4 tracking-tight">
            How It Works
          </h2>
          <p className="text-slate-400 text-lg">
            Build workflows by connecting nodes. Each node performs one operation (LLM call, image generation, data transformation). 
            Connections are type-safe to prevent errors. Execute locally or deploy to cloud infrastructure.
          </p>
        </div>

        {/* Connection Lines (Desktop Only) */}
        <div className="hidden md:block absolute top-1/2 left-0 w-full -translate-y-1/2 px-12 pointer-events-none z-0">
          <div className="relative w-full h-[2px] bg-gradient-to-r from-transparent via-slate-800 to-transparent">
             {/* Animated flow dots */}
             <div className="absolute top-1/2 left-0 w-full -translate-y-1/2 overflow-hidden h-4">
                <div className="w-20 h-[2px] bg-gradient-to-r from-transparent via-blue-500 to-transparent absolute top-1/2 animate-flow-line" />
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 relative z-10">
          <Card 
            title="Build" 
            subtitle="Drag nodes onto the canvas and connect them. Type-safe connections prevent incompatible data flows. Each node represents one operation (LLM, image gen, data transform)." 
            step={1}
            accentColor="blue"
          >
            <BuildGraphic />
          </Card>
          
          <Card 
            title="Run" 
            subtitle="Execute workflows locally on your machine. Watch outputs generate in real-time. Inspect intermediate results at each node. Full execution logs available." 
            step={2}
            accentColor="purple"
          >
            <RunGraphic />
          </Card>
          
          <Card 
            title="Deploy" 
            subtitle="Export workflows to Docker containers. Deploy to RunPod, Google Cloud Run, or your own servers. Same workflow code runs everywhere." 
            step={3}
            accentColor="emerald"
          >
            <DeployGraphic />
          </Card>
        </div>
      </div>
      
      <style jsx>{`
        @keyframes flow-line {
          0% { left: 0; opacity: 0; }
          50% { opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
        .animate-flow-line {
          animation: flow-line 3s linear infinite;
        }
      `}</style>
    </div>
  );
}

/**
 * Main Card Component with Tilt and Hover effects
 */
function Card({ title, subtitle, children, step, accentColor }: CardProps) {
  const [reduced, setReduced] = useState(false);
  const tiltRef = useRef<HTMLDivElement>(null);

  // Gradient Maps
  const gradients: Record<AccentColor, string> = {
    blue: "from-blue-500/20 to-cyan-500/5 hover:border-blue-500/50",
    purple: "from-purple-500/20 to-pink-500/5 hover:border-purple-500/50",
    emerald: "from-emerald-500/20 to-teal-500/5 hover:border-emerald-500/50",
  };
  
  const textAccents: Record<AccentColor, string> = {
    blue: "text-blue-400 group-hover:text-blue-300",
    purple: "text-purple-400 group-hover:text-purple-300",
    emerald: "text-emerald-400 group-hover:text-emerald-300",
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const el = tiltRef.current;
    if (!el) return;

    const maxTilt = 8;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      
      // Calculate rotation
      const rx = (-py * maxTilt).toFixed(2);
      const ry = (px * maxTilt).toFixed(2);
      
      // Calculate glare position
      const mx = ((px + 0.5) * 100).toFixed(2);
      const my = ((py + 0.5) * 100).toFixed(2);

      el.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.02, 1.02, 1.02)`;
      el.style.setProperty("--mx", `${mx}%`);
      el.style.setProperty("--my", `${my}%`);
    };

    const onLeave = () => {
      el.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced]);

  return (
    <div className="group relative h-full">
      {/* Connector Arrow for Mobile (Between Cards) */}
      {step < 3 && (
        <div className="md:hidden absolute -bottom-6 left-1/2 -translate-x-1/2 text-slate-700 z-0">
          <ArrowRight className="w-6 h-6 rotate-90" />
        </div>
      )}

      <div
        ref={tiltRef}
        className={`relative h-full rounded-3xl bg-[#0f111a] border border-white/5 p-1 transition-all duration-500 ease-out will-change-transform ${gradients[accentColor]} shadow-2xl`}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Inner Content Container */}
        <div className="relative h-full rounded-[20px] bg-[#131620]/80 backdrop-blur-xl p-6 lg:p-8 overflow-hidden flex flex-col">
          
          {/* Dynamic Glare */}
          {!reduced && (
            <div
              className="pointer-events-none absolute inset-0 z-50 transition-opacity duration-500 group-hover:opacity-100 opacity-0"
              style={{
                background: `radial-gradient(600px circle at var(--mx) var(--my), rgba(255,255,255,0.06), transparent 40%)`,
              }}
            />
          )}

          {/* Large Watermark Number */}
          <div className="absolute -right-4 -top-8 text-[120px] font-bold text-white/[0.02] select-none font-mono pointer-events-none group-hover:text-white/[0.04] transition-colors">
            0{step}
          </div>

          {/* Graphic Area */}
          <div className="relative h-48 w-full mb-8 flex items-center justify-center perspective-500">
             {children}
          </div>

          {/* Text Content */}
          <div className="mt-auto relative z-10">
            <h3 className={`text-xl font-bold mb-3 flex items-center gap-2 ${textAccents[accentColor]}`}>
              {step === 1 && <Box className="w-5 h-5" />}
              {step === 2 && <ImageIcon className="w-5 h-5" />}
              {step === 3 && <Globe className="w-5 h-5" />}
              {title}
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed font-medium">
              {subtitle}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Graphic 1: The Node Builder
 * Animated nodes connecting to each other
 */
function BuildGraphic() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

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

  // Coordinates based on container height of 192px (h-48)
  // Source Center: Left 32px + 24px = 56px, Top 50% = 96px
  // Target Center: Right 32px + 20px = 52px from right, Top 25%/75%
  
  const x1 = 56;
  const y1 = 96;
  const x2 = width - 52;
  const y2a = 48;  // 25%
  const y2b = 144; // 75%

  const c1x = x1 + (x2 - x1) * 0.5;

  return (
    <div ref={containerRef} className="w-full h-full relative flex items-center justify-center">
      {/* Connecting Path */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ filter: "drop-shadow(0 0 4px rgba(59, 130, 246, 0.5))" }}>
        {width > 0 && (
          <>
            <path 
              d={`M ${x1} ${y1} C ${c1x} ${y1}, ${c1x} ${y2a}, ${x2} ${y2a}`}
              fill="none" 
              stroke="url(#gradient-line)" 
              strokeWidth="2" 
              strokeDasharray="4 4"
              className="animate-[dash_1s_linear_infinite]"
            />
            <path 
              d={`M ${x1} ${y1} C ${c1x} ${y1}, ${c1x} ${y2b}, ${x2} ${y2b}`}
              fill="none" 
              stroke="url(#gradient-line)" 
              strokeWidth="2"
              strokeDasharray="4 4" 
              className="animate-[dash_1s_linear_infinite_reverse]"
            />
          </>
        )}
        <defs>
          <linearGradient id="gradient-line" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(59, 130, 246, 0.2)" />
            <stop offset="100%" stopColor="rgba(59, 130, 246, 1)" />
          </linearGradient>
        </defs>
      </svg>
      
      {/* Node 1 (Source) */}
      <div className="absolute left-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-xl bg-slate-800 border border-slate-600 flex items-center justify-center shadow-lg shadow-blue-900/20 z-10">
        <Layers className="w-6 h-6 text-blue-400" />
      </div>

      {/* Node 2 (Target Top) */}
      <div className="absolute right-8 top-[25%] -translate-y-1/2 w-10 h-10 rounded-lg bg-slate-800 border border-blue-500/30 flex items-center justify-center shadow-lg z-10 animate-pulse">
        <Cpu className="w-5 h-5 text-blue-300" />
      </div>

      {/* Node 3 (Target Bottom) */}
      <div className="absolute right-8 top-[75%] -translate-y-1/2 w-10 h-10 rounded-lg bg-slate-800 border border-blue-500/30 flex items-center justify-center shadow-lg z-10 animate-pulse delay-75">
        <Zap className="w-5 h-5 text-yellow-300" />
      </div>

      <style jsx>{`
        @keyframes dash {
          to { stroke-dashoffset: -8; }
        }
      `}</style>
    </div>
  );
}

/**
 * Graphic 2: The Visual Run (Updated)
 * Shows UI with graph sidebar and image output being generated
 */
function RunGraphic() {
  return (
    <div className="w-full max-w-[90%] aspect-[16/10] bg-[#1e293b] rounded-lg border border-slate-700/50 overflow-hidden shadow-2xl relative flex flex-col select-none">
      {/* Window Header */}
      <div className="h-7 bg-slate-900 border-b border-white/5 flex items-center justify-between px-3">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-slate-700" />
          <div className="w-2 h-2 rounded-full bg-slate-700" />
        </div>
        <div className="text-[9px] font-medium text-slate-500 uppercase tracking-wider">Preview Output</div>
      </div>

      <div className="flex-1 flex">
        {/* Sidebar: Workflow Steps */}
        <div className="w-16 sm:w-20 border-r border-white/5 bg-slate-900/30 p-2 flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="group flex items-center gap-2 p-1.5 rounded bg-white/5 border border-white/5">
              <div className={`w-1.5 h-1.5 rounded-full ${i === 3 ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
              <div className="h-1 w-6 sm:w-8 bg-slate-600/50 rounded-full" />
            </div>
          ))}
        </div>

        {/* Main Content: Image Generation */}
        <div className="flex-1 p-3 flex items-center justify-center bg-[#0B0C10] relative overflow-hidden">
          <div className="relative w-full h-full rounded border border-white/10 overflow-hidden">
             {/* The "Result" Image Gradient */}
             <img src="/cat.png" alt="Generated Output" className="absolute inset-0 w-full h-full object-cover" />
             
             {/* Scanning Line overlay covering the image (Scanning Down) */}
             <div 
               className="absolute inset-0 bg-[#0B0C10] border-b border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)] z-10 animate-scan-reveal origin-top"
             />

             {/* UI overlay on top of image */}
             <div className="absolute bottom-2 left-2 flex gap-2 z-20">
                <div className="px-2 py-0.5 rounded-full bg-black/40 backdrop-blur border border-white/10 text-[8px] text-white/70">
                   1024x1024
                </div>
             </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .animate-scan-reveal {
          animation: scan-reveal 4s ease-in-out infinite;
        }
        @keyframes scan-reveal {
          0% { height: 100%; border-bottom-width: 2px; }
          40% { height: 0%; border-bottom-width: 2px; }
          60% { height: 0%; border-bottom-width: 0px; opacity: 0; }
          100% { height: 0%; border-bottom-width: 0px; opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/**
 * Graphic 3: Deploy Scale
 * A central globe pulsing signals to satellites
 */
function DeployGraphic() {
  return (
    <div className="w-full h-full relative flex items-center justify-center">
      {/* Orbit Rings */}
      <div className="absolute w-32 h-32 rounded-full border border-emerald-500/10 animate-[spin_10s_linear_infinite]" />
      <div className="absolute w-44 h-44 rounded-full border border-emerald-500/5 animate-[spin_15s_linear_infinite_reverse]" />

      {/* Center Core */}
      <div className="relative z-10 w-16 h-16 rounded-full bg-gradient-to-br from-emerald-900 to-slate-900 border border-emerald-500/50 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.2)]">
        <Globe className="w-8 h-8 text-emerald-400" />
        {/* Ping Effect */}
        <div className="absolute inset-0 rounded-full border border-emerald-400 animate-ping opacity-20" />
      </div>

      {/* Satellites */}
      <div className="absolute w-full h-full animate-[spin_8s_linear_infinite]">
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-3 h-3 bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
      </div>
      <div className="absolute w-full h-full animate-[spin_12s_linear_infinite_reverse]">
        <div className="absolute bottom-8 right-[20%] w-2 h-2 bg-emerald-600 rounded-full" />
      </div>
      
       {/* Success Toast */}
       <div className="absolute -bottom-2 bg-emerald-900/80 border border-emerald-500/30 text-emerald-200 text-xs px-3 py-1 rounded-full flex items-center gap-1.5 shadow-lg backdrop-blur-md animate-[bounce_3s_infinite]">
         <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
         Workflow online
       </div>
    </div>
  );
}