interface WindowControls {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

declare global {
  interface Window {
    api: {
      runApp: (workflowId: string) => void;
      clipboardWriteText: (text: string) => void;
      clipboardReadText: () => string;
    };
    windowControls?: WindowControls;
    process: {
      type: string;
      platform: string;
      versions: {
        node: string;
        electron: string;
        chrome: string;
      };
    };
    api: {
      ipcRenderer: {
        send: (channel: string, ...args: any[]) => void;
        on: (channel: string, listener: (...args: any[]) => void) => void;
        invoke: (channel: string, ...args: any[]) => Promise<any>;
      };
    };
  }
}

export {};
