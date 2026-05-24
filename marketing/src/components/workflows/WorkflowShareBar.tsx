"use client";

import React from "react";
import { Twitter, Linkedin, Link2 } from "lucide-react";

interface WorkflowShareBarProps {
  url: string;
  title: string;
}

export default function WorkflowShareBar({ url, title }: WorkflowShareBarProps) {
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard may be blocked in some embed contexts; silently no-op.
    }
  };

  const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    `${title} — built on @nodetool_ai`
  )}&url=${encodeURIComponent(url)}`;
  const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

  return (
    <div className="flex items-center gap-2">
      <a
        href={tweet}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
      >
        <Twitter className="h-3.5 w-3.5" /> Share
      </a>
      <a
        href={linkedin}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
      >
        <Linkedin className="h-3.5 w-3.5" /> Post
      </a>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
      >
        <Link2 className="h-3.5 w-3.5" /> Copy link
      </button>
    </div>
  );
}
