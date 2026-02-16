import { useState, useCallback, useRef } from "react";

interface UseCopyToClipboardOptions {
  /** Duration in milliseconds to show the "copied" feedback */
  feedbackDuration?: number;
  /** Callback after successful copy */
  onCopySuccess?: (text: string) => void;
  /** Callback when copy fails */
  onCopyError?: (error: Error) => void;
}

interface UseCopyToClipboardReturn {
  /** Whether text was recently copied (during feedback duration) */
  isCopied: boolean;
  /** Copy text to clipboard */
  copyToClipboard: (text: string) => Promise<void>;
  /** The most recently copied text */
  copiedText: string | null;
}

/**
 * Hook for copying text to clipboard with user feedback.
 * 
 * @example
 * const { isCopied, copyToClipboard } = useCopyToClipboard();
 * <Button onClick={() => copyToClipboard('Hello')}>
 *   {isCopied ? 'Copied!' : 'Copy'}
 * </Button>
 */
export function useCopyToClipboard(
  options: UseCopyToClipboardOptions = {}
): UseCopyToClipboardReturn {
  const {
    feedbackDuration = 1500,
    onCopySuccess,
    onCopyError
  } = options;

  const [isCopied, setIsCopied] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const copyToClipboard = useCallback(
    async (text: string): Promise<void> => {
      try {
        await navigator.clipboard.writeText(text);
        
        setCopiedText(text);
        setIsCopied(true);
        
        if (onCopySuccess) {
          onCopySuccess(text);
        }

        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // Set feedback to false after duration
        timeoutRef.current = setTimeout(() => {
          setIsCopied(false);
          timeoutRef.current = null;
        }, feedbackDuration);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (onCopyError) {
          onCopyError(err);
        }
        // Also throw so caller can handle if needed
        throw err;
      }
    },
    [feedbackDuration, onCopySuccess, onCopyError]
  );

  return {
    isCopied,
    copyToClipboard,
    copiedText
  };
}
