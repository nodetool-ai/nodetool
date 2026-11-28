"use client";
import { useEffect, useState } from "react";

/** The Network Information API fields this hook reads (Chromium only). */
type NetworkInformation = EventTarget & { saveData?: boolean; effectiveType?: string };

const SLOW_CONNECTIONS = new Set(["slow-2g", "2g", "3g"]);

/**
 * True when the reader asked to save data (`Save-Data`) or the browser
 * measures the connection as 3G or slower. Pages then hold large media until
 * the reader asks for it. Browsers without the Network Information API
 * (Safari, Firefox) report false, so nothing changes for them.
 */
export function shouldSaveData(connection: NetworkInformation | undefined): boolean {
  if (!connection) return false;
  return connection.saveData === true || SLOW_CONNECTIONS.has(connection.effectiveType ?? "");
}

export function useDataSaver(): boolean {
  const [saveData, setSaveData] = useState(false);
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (!connection) return;
    const update = () => setSaveData(shouldSaveData(connection));
    update();
    connection.addEventListener?.("change", update);
    return () => connection.removeEventListener?.("change", update);
  }, []);
  return saveData;
}
