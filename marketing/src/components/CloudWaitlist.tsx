"use client";
import React, { useState } from "react";
import { track } from "../lib/analytics";

/**
 * Cloud alpha → GA waitlist capture (D4). Posts to a configurable endpoint
 * (`NEXT_PUBLIC_WAITLIST_ENDPOINT`) when set; otherwise degrades gracefully to
 * an email so the form always does something useful.
 */
const ENDPOINT = process.env.NEXT_PUBLIC_WAITLIST_ENDPOINT;

type Status = "idle" | "submitting" | "success" | "error";

export default function CloudWaitlist() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || status === "submitting") return;
    track("Contact", { form: "cloud-waitlist" });

    if (!ENDPOINT) {
      window.location.href = `mailto:hello@nodetool.ai?subject=${encodeURIComponent(
        "NodeTool Cloud waitlist"
      )}&body=${encodeURIComponent(`Please add me to the Cloud waitlist: ${email}`)}`;
      setStatus("success");
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "cloud-waitlist" }),
      });
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <p
        role="status"
        className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm font-medium text-emerald-200"
      >
        You&apos;re on the list. We&apos;ll be in touch as Cloud opens up.
      </p>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full flex-col gap-3 sm:flex-row"
      aria-label="Join the NodeTool Cloud waitlist"
    >
      <label htmlFor="cloud-waitlist-email" className="sr-only">
        Email address
      </label>
      <input
        id="cloud-waitlist-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@studio.com"
        autoComplete="email"
        className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3.5 text-sm text-white placeholder:text-slate-500 focus-ring sm:flex-1"
      />
      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-blue-500 focus-ring disabled:opacity-60"
      >
        {status === "submitting" ? "Joining…" : "Join the waitlist"}
      </button>
      {status === "error" && (
        <p role="alert" className="text-sm text-rose-300 sm:basis-full">
          Something went wrong. Email{" "}
          <a className="underline" href="mailto:hello@nodetool.ai">
            hello@nodetool.ai
          </a>{" "}
          and we&apos;ll add you.
        </p>
      )}
    </form>
  );
}
