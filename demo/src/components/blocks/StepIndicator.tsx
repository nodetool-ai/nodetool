"use client";
import React from "react";

interface Step { num: number; label: string; }

export function StepIndicator({ steps, current }: { steps: Step[]; current: number }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((s, i) => {
        const isActive = s.num === current;
        const isDone = s.num < current;
        return (
          <div key={s.num} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                isActive ? "bg-indigo-500 text-white shadow-[0_0_20px_-3px_rgba(99,102,241,0.5)]"
                : isDone ? "bg-green-500/20 text-green-400 border border-green-500/50"
                : "bg-muted text-slate-500 border border-border"
              }`}>
                {isDone ? "✓" : s.num}
              </div>
              <span className={`text-[0.65rem] font-semibold uppercase tracking-wider ${
                isActive ? "text-indigo-300" : isDone ? "text-green-400" : "text-slate-600"
              }`}>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-16 h-px mx-3 mb-5 transition-colors duration-300 ${isDone ? "bg-green-500/50" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
