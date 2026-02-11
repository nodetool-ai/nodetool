import { useState, useCallback, useRef } from "react";

interface UseCopyToClipboardOptions {
  /**
   * Duration in milliseconds to show the "copied" feedback
   * @default 1500
   */
  feedbackDuration?: number;
  /**
   * Callback function to execute after successful copy
   */
  onCopySuccess?: (text: string) => void;
  /**
   * Callback function to execute when copy fails
   */
  onCopyError?: (error: Error) => void;
}

interface UseCopyToClipboardReturn {
  /**
   * Whether the text was recently copied (during feedback duration)
   */
  isCopied: boolean;
  /**
   * Copy text to clipboard
   * @param text - The text to copy
   * @returns Promise that resolves when copy is complete
   */
  copyToClipboard: (text: string) => Promise<void>;
  /**
   * The most recently copied text
   */
  copiedText: string | null;
}

/**
 * Custom hook for copying text to clipboard with user feedback.
 * 
 * Provides a simple interface for copying text to clipboard with
 * temporary feedback state to show success indicators.
 * 
 * @param options - Configuration options
 * @returns Object containing copy function and feedback state
 * 
 * @example
 * ```typescript
 * const { isCopied, copyToClipboard } = useCopyToClipboard({
 *   feedbackDuration: 2000,
 *   onCopySuccess: (text) => console.log('Copied:', text)
 * });
 * 
 * <Button onClick={() => copyToClipboard('Hello World')}>
 *   {isCopied ? 'Copied!' : 'Copy'}
 * </Button>
 * ```
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
