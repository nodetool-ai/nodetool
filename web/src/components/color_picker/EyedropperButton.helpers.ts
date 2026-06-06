// EyeDropper API types (not yet in TypeScript standard library)
interface EyeDropperResult {
  sRGBHex: string;
}

interface EyeDropperInstance {
  open(): Promise<EyeDropperResult>;
}

interface EyeDropperConstructor {
  new(): EyeDropperInstance;
}

declare global {
  interface Window {
    EyeDropper?: EyeDropperConstructor;
  }
}

// Check if EyeDropper API is supported
export const isEyeDropperSupported = (): boolean => {
  return typeof window !== "undefined" && "EyeDropper" in window;
};
