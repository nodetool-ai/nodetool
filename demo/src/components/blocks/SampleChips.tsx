"use client";
import React from "react";
import { Badge } from "@/components/ui/badge";

interface Sample { label: string; text: string; }

export function SampleChips({ samples, selected, onSelect }: { samples: Sample[]; selected: string; onSelect: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {samples.map((s) => (
        <Badge
          key={s.label}
          variant="outline"
          className={`cursor-pointer transition-all hover:bg-indigo-500/5 hover:border-indigo-500 hover:text-slate-200 ${
            selected === s.text
              ? "bg-indigo-500/10 border-indigo-400 text-indigo-200 shadow-[0_0_8px_-2px_rgba(99,102,241,0.3)]"
              : "text-slate-400"
          }`}
          onClick={() => onSelect(s.text)}
        >
          {s.label}
        </Badge>
      ))}
    </div>
  );
}
