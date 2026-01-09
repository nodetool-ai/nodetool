import { useCallback, useEffect, useMemo } from "react";
import log from "loglevel";
import useSessionStateStore from "../../stores/SessionStateStore";

export const useClipboard = () => {
  const {
    clipboardData,
    setClipboardData,
    isClipboardValid,
    setIsClipboardValid
  } = useSessionStateStore((state) => ({
    clipboardData: state.clipboardData,
    setClipboardData: state.setClipboardData,
    isClipboardValid: state.isClipboardValid,
    setIsClipboardValid: state.setIsClipboardValid
  }));
  const isFirefox = useMemo(
    () => navigator.userAgent.toLowerCase().includes("firefox"),
    []
  );

  // Check if Electron API is available
  const hasElectronApi = useMemo(() => typeof window !== "undefined" && !!window.api, []);

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
     } catch (_error) {
      return false;
    }
  }, []);

  const readClipboard = useCallback(async (): Promise<{
    data: string | null;
    isValid: boolean;
  }> => {
    log.info("Attempting to read from clipboard.");
    let data = "";
    
    if (isFirefox && clipboardData) {
      data = clipboardData;
    } else if (hasElectronApi && window.api?.clipboardReadText) {
      // Prefer Electron API when available
      try {
        data = await window.api.clipboardReadText();
        log.info("Clipboard read via Electron API.");
      } catch (_e) {
        log.warn("Electron clipboard read failed, falling back to navigator.");
        if (document.hasFocus() && navigator.clipboard) {
          data = await navigator.clipboard.readText();
        }
      }
    } else {
      if (document.hasFocus() && navigator.clipboard) {
        data = await navigator.clipboard.readText();
        log.info("Clipboard read successfully.");
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
        log.info("Attempting to write to clipboard.");
        const outputData = formatJson
          ? JSON.stringify(JSON.parse(data), null, 2)
          : data;

        if (isFirefox) {
          setClipboardData(outputData);
        }
        setClipboardData(outputData);
        
        // Prefer Electron API when available
        if (hasElectronApi && window.api?.clipboardWriteText) {
          window.api.clipboardWriteText(outputData);
          log.info("Clipboard written via Electron API.");
        } else {
          await navigator.clipboard.writeText(outputData);
          log.info("Clipboard written via navigator API.");
        }
      }
    },
    [hasElectronApi, isFirefox, setClipboardData, setIsClipboardValid, validateData]
  );

  return { clipboardData, readClipboard, writeClipboard, isClipboardValid };
};
