export {};

declare global {
  interface Window {
    windowControls: {
      close: () => void;
      minimize: () => void;
      maximize: () => void;
    };
  }
}
