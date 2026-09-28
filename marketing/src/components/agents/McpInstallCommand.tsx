"use client";
import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

export const MCP_INSTALL_COMMAND =
  "npx -y --package=@nodetool-ai/cli nodetool mcp install";

export default function McpInstallCommand() {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(MCP_INSTALL_COMMAND);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }

  return (
    <div>
      <div className="flex items-stretch overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-4 py-3 font-jetbrains text-sm text-slate-100">
          <span className="select-none text-slate-500">$ </span>
          {MCP_INSTALL_COMMAND}
        </code>
        <button
          type="button"
          onClick={copyCommand}
          aria-label="Copy the install command"
          className="inline-flex min-w-12 items-center justify-center border-l border-slate-700 px-4 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-ring"
        >
          {copied ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      <p role="status" className="mt-2 min-h-5 text-sm text-slate-400">
        {copyError
          ? "Select the command above and copy it."
          : copied
            ? "Copied to clipboard."
            : ""}
      </p>
    </div>
  );
}
