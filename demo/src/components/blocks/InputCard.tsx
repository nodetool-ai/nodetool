"use client";
import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SampleChips } from "./SampleChips";

interface Sample { label: string; text: string; }

interface InputCardProps {
  title: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
  samples?: Sample[];
  disabled?: boolean;
  rows?: number;
}

export function InputCard({ title, description, value, onChange, onSubmit, submitLabel = "Run →", samples, disabled, rows = 5 }: InputCardProps) {
  return (
    <Card className="overflow-hidden border-border/60">
      <CardHeader className="relative pb-4">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-sm">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {samples && <SampleChips samples={samples} selected={value} onSelect={onChange} />}
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="resize-y focus:border-indigo-500/50" />
        <Button
          className="w-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-semibold hover:opacity-90 transition-all"
          onClick={onSubmit} disabled={disabled || !value.trim()} size="lg"
        >
          {submitLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
