/**
 * Global type declarations for the React Native mobile app.
 */

/** React Native global __DEV__ flag */
declare const __DEV__: boolean;

/**
 * React Native WebSocket event types.
 * These are provided by the RN runtime but not always available in type-only environments.
 */
interface WebSocketMessageEvent {
  data: string | ArrayBuffer | Blob;
}

interface WebSocketCloseEvent {
  code?: number;
  reason?: string;
  message?: string;
}

/**
 * FileReader API — available in the React Native runtime but not in the
 * ES2020 lib (requires DOM). Declare the subset used by WebSocketManager.
 */
declare class FileReader {
  result: string | ArrayBuffer | null;
  onload: ((this: FileReader, ev: ProgressEvent) => void) | null;
  onerror: ((this: FileReader, ev: ProgressEvent) => void) | null;
  readAsArrayBuffer(blob: Blob): void;
  readAsText(blob: Blob, encoding?: string): void;
}

interface ProgressEvent {
  readonly lengthComputable: boolean;
  readonly loaded: number;
  readonly total: number;
}

/**
 * Augment Jest matchers with @testing-library/jest-native custom matchers.
 */
declare namespace jest {
  interface Matchers<R> {
    toHaveTextContent(text: string | RegExp): R;
  }
}
