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
    } catch (error) {
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
    } else {
      if (document.hasFocus()) {
        if (navigator.clipboard) {
          data = await navigator.clipboard.readText();
          log.info("Clipboard read successfully.");
        }
      }
    }
    const isValid = validateData(data);
    setIsClipboardValid(isValid);
    setClipboardData(isValid ? data : null);
    return { data: isValid ? data : null, isValid };
  }, [
    clipboardData,
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
        await navigator.clipboard.writeText(outputData);
      }
    },
    [isFirefox, setClipboardData, setIsClipboardValid, validateData]
  );

  return { clipboardData, readClipboard, writeClipboard, isClipboardValid };
};
