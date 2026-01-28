import { useState, useCallback, useEffect, useRef } from "react";

export interface UseCopyFeedbackOptions {
  /**
   * Duration in milliseconds to show feedback after copying
   * @default 1500
   */
  feedbackDuration?: number;
}

export interface UseCopyFeedbackResult {
  /**
   * The format that was recently copied (e.g., "hex", "rgb", "css")
   */
  copiedFormat: string | null;
  /**
   * Show feedback for a specific format
   * @param format - The format identifier to display
   */
  showFeedback: (format: string) => void;
  /**
   * Clear the current feedback
   */
  clearFeedback: () => void;
}

/**
 * Custom hook for managing copy-to-clipboard feedback timing.
 * Shows temporary feedback that automatically disappears after a specified duration.
 *
 * @param options - Configuration options for feedback behavior
 * @returns Object containing feedback state and control functions
 *
 * @example
 * const { copiedFormat, showFeedback } = useCopyFeedback({ feedbackDuration: 2000 });
 * 
 * const handleCopyHex = () => {
 *   navigator.clipboard.writeText(hexValue);
 *   showFeedback("hex");
 * };
 * 
 * return (
 *   <div>
 *     {copiedFormat === "hex" && <span>Copied!</span>}
 *     <button onClick={handleCopyHex}>Copy Hex</button>
 *   </div>
 * );
 */
export function useCopyFeedback(
  options: UseCopyFeedbackOptions = {}
): UseCopyFeedbackResult {
  const { feedbackDuration = 1500 } = options;
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const showFeedback = useCallback(
    (format: string) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setCopiedFormat(format);

      // Set new timeout to clear feedback
      timeoutRef.current = setTimeout(() => {
        setCopiedFormat(null);
        timeoutRef.current = null;
      }, feedbackDuration);
    },
    [feedbackDuration]
  );

  const clearFeedback = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setCopiedFormat(null);
  }, []);

  return {
    copiedFormat,
    showFeedback,
    clearFeedback
  };
}
