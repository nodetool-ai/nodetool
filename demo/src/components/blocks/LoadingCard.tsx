"use client";
import React from "react";
import { Card, CardContent } from "@/components/ui/card";

export function LoadingCard({ title = "Processing…", subtitle }: { title?: string; subtitle?: string }) {
  return (
    <Card className="overflow-hidden border-indigo-500/30 shadow-[0_0_40px_-8px_rgba(99,102,241,0.2)]">
      <CardContent className="py-16 flex flex-col items-center gap-6">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 animate-spin" />
          <div className="absolute inset-3 rounded-full border-2 border-transparent border-t-violet-500 animate-spin [animation-direction:reverse] [animation-duration:1.5s]" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-200 mb-1">{title}</p>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
