"use client";

import { useEffect } from "react";
import { track } from "../lib/analytics";

/** Emits Plausible's 404 goal with the missing path, so broken inbound links can be found. */
export default function NotFoundTracker(): null {
  useEffect(() => {
    track("404", { path: window.location.pathname });
  }, []);
  return null;
}
