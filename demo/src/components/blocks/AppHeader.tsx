"use client";
import React from "react";

interface AppHeaderProps {
  icon?: string;
  title: string;
  subtitle?: React.ReactNode;
}

export function AppHeader({ icon, title, subtitle }: AppHeaderProps) {
  return (
    <header className="relative overflow-hidden text-center pt-10 pb-8">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.12),transparent_70%)]" />
      <div className="relative">
        <div className="flex items-center justify-center gap-2.5 mb-2">
          {icon && <span className="text-3xl">{icon}</span>}
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        </div>
        {subtitle && <p className="text-slate-500 text-sm">{subtitle}</p>}
      </div>
    </header>
  );
}
