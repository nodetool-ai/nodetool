export {};

declare global {
  interface Window {
    electron?: {
      // Define the shape of the electron object if needed, or use `any`
      // For example:
      // send: (channel: string, ...args: any[]) => void;
      // receive: (channel: string, func: (...args: any[]) => void) => void;
      // [key: string]: any; // Or more specific types
      ipcRenderer: any; // A common example, adjust as needed
    };
    DEBUG_WINDOW_CONTROLS?: boolean;
    process?: {
      type?: string;
      versions?: {
        electron?: string;
        // other versions like chrome, node etc. can also be here
      };
      // other process properties if needed
    };
  }
}
