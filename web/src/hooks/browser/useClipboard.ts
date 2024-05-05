import { useEffect } from "react";
import { devError, devLog } from "../../utils/DevLog";
import useSessionStateStore from "../../stores/SessionStateStore";

export const useClipboard = () => {
  const {
    clipboardData,
    setClipboardData,
    isClipboardValid,
    setIsClipboardValid
  } = useSessionStateStore();
  const isFirefox = navigator.userAgent.toLowerCase().includes("firefox");

  useEffect(() => {
    if (isFirefox) {
      setClipboardData(null);
    }
  }, [isFirefox, setClipboardData]);

  const validateData = (data: string): boolean => {
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
      devLog("useClipboard: Validating data ERROR");
      return false;
    }
  };

  const readClipboard = async (): Promise<{
    data: string | null;
    isValid: boolean;
  }> => {
    devLog("Attempting to read from clipboard.");
    let data = "";
    if (isFirefox && clipboardData) {
      data = clipboardData;
    } else {
      if (document.hasFocus()) {
        try {
          if (navigator.clipboard) {
            data = await navigator.clipboard.readText();
            devLog("Clipboard read successfully.");
          }
        } catch (error) {
          devError("Error reading clipboard:", error);
          return { data: null, isValid: false };
        }
      }
    }
    const isValid = validateData(data);
    setIsClipboardValid(isValid);
    setClipboardData(isValid ? data : null);
    return { data: isValid ? data : null, isValid };
  };

  const writeClipboard = async (
    data: string,
    allowArbitrary: boolean = false,
    formatJson: boolean = false
  ) => {
    const isValid = allowArbitrary ? true : validateData(data);

    setIsClipboardValid(isValid);
    if (isValid) {
      devLog("Attempting to write to clipboard.");
      const outputData = formatJson
        ? JSON.stringify(JSON.parse(data), null, 2)
        : data;

      if (isFirefox) {
        setClipboardData(outputData);
      }
      setClipboardData(outputData);
      try {
        await navigator.clipboard.writeText(outputData);
      } catch (error) {
        devLog("Error writing to clipboard:", error);
      }
    }
  };

  return { clipboardData, readClipboard, writeClipboard, isClipboardValid };
};
