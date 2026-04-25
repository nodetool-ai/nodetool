import { useCallback, useEffect, useMemo } from "react";
import useSessionStateStore from "../../stores/SessionStateStore";
import { copyAssetToClipboard } from "../../utils/clipboardUtils";
import type {} from "../../window.d";

export const useClipboard = () => {
  const clipboardData = useSessionStateStore((state) => state.clipboardData);
  const setClipboardData = useSessionStateStore((state) => state.setClipboardData);
  const isClipboardValid = useSessionStateStore((state) => state.isClipboardValid);
  const setIsClipboardValid = useSessionStateStore((state) => state.setIsClipboardValid);
  const isFirefox = useMemo(
    () => navigator.userAgent.toLowerCase().includes("firefox"),
    []
  );

  // Check if Electron API is available
  const hasElectronApi = useMemo(
    () => typeof window !== "undefined" && !!window.api,
    []
  );

  useEffect(() => {
    if (isFirefox) {
      setClipboardData(null);
    }
  }, [isFirefox, setClipboardData]);

  const validateData = useCallback((data: string): boolean => {
    try {
      const parsedData = JSON.parse(data);
      const hasNodes =
        Object.prototype.hasOwnProperty.call(parsedData, "nodes") &&
        Array.isArray(parsedData.nodes) &&
        parsedData.nodes.length > 0;
      const hasValidEdges =
        Object.prototype.hasOwnProperty.call(parsedData, "edges") &&
        Array.isArray(parsedData.edges);
      return hasNodes && hasValidEdges;
    } catch {
      return false;
    }
  }, []);

  const readClipboard = useCallback(async (): Promise<{
    data: string | null;
    isValid: boolean;
  }> => {
    console.info("Attempting to read from clipboard.");
    let data = "";

    if (isFirefox && clipboardData) {
      data = clipboardData;
    } else if (hasElectronApi && window.api?.clipboard?.readText) {
      // Prefer new Electron API when available
      try {
        data = await window.api.clipboard.readText();
        console.info("Clipboard read via Electron clipboard API.");
      } catch {
        if (document.hasFocus() && navigator.clipboard) {
          data = await navigator.clipboard.readText();
        }
      }
    } else if (hasElectronApi && !window.api?.clipboard?.readText) {
      // Fallback to web API if Electron API exists but readText doesn't (should be rare/impossible with types)
      if (document.hasFocus() && navigator.clipboard) {
        data = await navigator.clipboard.readText();
      }
    } else {
      if (document.hasFocus() && navigator.clipboard) {
        data = await navigator.clipboard.readText();
        console.info("Clipboard read successfully.");
      }
    }

    const isValid = validateData(data);
    setIsClipboardValid(isValid);
    setClipboardData(isValid ? data : null);
    return { data: isValid ? data : null, isValid };
  }, [
    clipboardData,
    hasElectronApi,
    isFirefox,
    setClipboardData,
    setIsClipboardValid,
    validateData
  ]);

  const writeClipboard = useCallback(
    async (
      data: string,
      allowArbitrary: boolean = false,
      formatJson: boolean = false
    ) => {
      const isValid = allowArbitrary ? true : validateData(data);

      setIsClipboardValid(isValid);
      if (isValid) {
        console.info("Attempting to write to clipboard.");
        const outputData = formatJson
          ? JSON.stringify(JSON.parse(data), null, 2)
          : data;

        setClipboardData(outputData);

        // Prefer new Electron API when available
        if (window.api?.clipboard?.writeText) {
          await window.api.clipboard.writeText(outputData);
          console.info("Clipboard written via Electron clipboard API.");
        } else {
          await navigator.clipboard.writeText(outputData);
          console.info("Clipboard written via navigator API.");
        }
      }
    },
    [isFirefox, setClipboardData, setIsClipboardValid, validateData]
  );

  return {
    clipboardData,
    readClipboard,
    writeClipboard,
    isClipboardValid,
    // Export utility function for asset-based clipboard operations
    copyAssetToClipboard
  };
};
