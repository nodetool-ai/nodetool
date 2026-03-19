"use client";
import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

type Variant = "success" | "warning" | "error" | "info";
const V: Record<Variant, { border: string; glow: string; dot: string; line: string }> = {
  success: { border: "border-green-500/20", glow: "shadow-[0_0_30px_-8px_rgba(34,197,94,0.1)]", dot: "bg-green-500", line: "via-green-500/50" },
  warning: { border: "border-yellow-500/30", glow: "shadow-[0_0_30px_-8px_rgba(234,179,8,0.1)]", dot: "bg-yellow-500", line: "via-yellow-500/50" },
  error:   { border: "border-red-500/30",    glow: "shadow-[0_0_30px_-8px_rgba(239,68,68,0.1)]",  dot: "bg-red-500",    line: "via-red-500/50" },
  info:    { border: "border-indigo-500/30", glow: "shadow-[0_0_30px_-8px_rgba(99,102,241,0.1)]", dot: "bg-indigo-500", line: "via-indigo-500/50" },
};

export function ResultCard({ title, variant = "success", children }: { title: string; variant?: Variant; children: React.ReactNode }) {
  const s = V[variant];
  return (
    <Card className={`overflow-hidden ${s.border} ${s.glow}`}>
      <CardHeader className="relative pb-3">
        <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${s.line} to-transparent`} />
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${s.dot} animate-pulse`} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
