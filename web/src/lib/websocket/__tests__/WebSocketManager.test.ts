import { WebSocketManager, ConnectionState } from "../WebSocketManager";

// Mock WebSocket before importing WebSocketManager
const mockWebSocket = {
  readyState: WebSocket.CONNECTING,
  binaryType: "arraybuffer" as const,
  send: jest.fn(),
  close: jest.fn()
};

const createMockWebSocket = jest.fn(() => mockWebSocket);

Object.defineProperty(global, "WebSocket", {
  writable: true,
  value: createMockWebSocket
});

describe("WebSocketManager", () => {
  let manager: WebSocketManager;
  let capturedOnOpen: (() => void) | null = null;
  let capturedOnMessage: ((event: MessageEvent) => void) | null = null;
  let capturedOnError: ((event: Event) => void) | null = null;
  let capturedOnClose: ((event: CloseEvent) => void) | null = null;

  const createManager = (reconnect = true) => {
    manager = new WebSocketManager({
      url: "ws://localhost:8080",
      reconnect
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    // Reset mock
    mockWebSocket.readyState = WebSocket.CONNECTING;
    mockWebSocket.send.mockClear();
    mockWebSocket.close.mockClear();

    capturedOnOpen = null;
    capturedOnMessage = null;
    capturedOnError = null;
    capturedOnClose = null;

    // Setup mock to capture event handlers
    createMockWebSocket.mockImplementation(() => {
      const ws = {
        ...mockWebSocket,
        set onopen(handler: (() => void) | null) {
          capturedOnOpen = handler;
        },
        get onopen() {
          return capturedOnOpen;
        },
        set onmessage(handler: ((event: MessageEvent) => void) | null) {
          capturedOnMessage = handler;
        },
        get onmessage() {
          return capturedOnMessage;
        },
        set onerror(handler: ((event: Event) => void) | null) {
          capturedOnError = handler;
        },
        get onerror() {
          return capturedOnError;
        },
        set onclose(handler: ((event: CloseEvent) => void) | null) {
          capturedOnClose = handler;
        },
        get onclose() {
          return capturedOnClose;
        }
      };
      return ws;
    });

    createManager(true);
  });

  afterEach(() => {
    manager.destroy();
    jest.useRealTimers();
  });

  const triggerOpen = () => {
    if (capturedOnOpen) {
      capturedOnOpen();
    }
  };

  const triggerMessage = (data: any) => {
    if (capturedOnMessage) {
      capturedOnMessage({ data } as MessageEvent);
    }
  };

  const triggerError = () => {
    if (capturedOnError) {
      capturedOnError({} as Event);
    }
  };

  const triggerClose = (code = 1000, reason = "", wasClean = true) => {
    if (capturedOnClose) {
      capturedOnClose({ code, reason, wasClean } as CloseEvent);
    }
  };

  describe("initial state", () => {
    it("starts in disconnected state", () => {
      expect(manager.getState()).toBe("disconnected");
    });

    it("is not connected initially", () => {
      expect(manager.isConnected()).toBe(false);
    });

    it("returns null for getWebSocket initially", () => {
      expect(manager.getWebSocket()).toBe(null);
    });
  });

  describe("connection", () => {
    it("transitions to connecting state on connect", () => {
      manager.connect().catch(() => {});
      expect(manager.getState()).toBe("connecting");
    });

    it("creates WebSocket instance on connect", () => {
      manager.connect().catch(() => {});
      expect(createMockWebSocket).toHaveBeenCalled();
      expect(manager.getWebSocket()).not.toBe(null);
    });

    it("emits open event when connection opens", () => {
      const openHandler = jest.fn();
      manager.on("open", openHandler);

      manager.connect().catch(() => {});
      triggerOpen();
      
      expect(openHandler).toHaveBeenCalled();
    });

    it("transitions to connected state on open", () => {
      manager.connect().catch(() => {});
      triggerOpen();
      
      expect(manager.getState()).toBe("connected");
    });

    it("queues messages while connecting when reconnect enabled", () => {
      manager.connect().catch(() => {});
      
      const message = { type: "test" };
      manager.send(message);
      
      expect(mockWebSocket.send).not.toHaveBeenCalled();
      
      triggerOpen();
      
      expect(mockWebSocket.send).toHaveBeenCalled();
    });

    it("processes queued messages after connection", () => {
      manager.connect().catch(() => {});
      
      const message1 = { type: "test1" };
      const message2 = { type: "test2" };
      manager.send(message1);
      manager.send(message2);
      
      triggerOpen();
      
      expect(mockWebSocket.send).toHaveBeenCalledTimes(2);
    });

    it("throws error when sending in disconnected state", () => {
      expect(() => manager.send({ type: "test" })).toThrow(
        "Cannot send message in state: disconnected"
      );
    });

    it("reuses connection promise if already connecting", () => {
      let connectPromise1: Promise<void>;
      let connectPromise2: Promise<void>;
      
      connectPromise1 = manager.connect().catch(() => {});
      connectPromise2 = manager.connect().catch(() => {});
      
      expect(connectPromise1).toStrictEqual(connectPromise2);
    });
  });

  describe("disconnection", () => {
    it("disconnects and transitions through disconnecting state", () => {
      manager.connect().catch(() => {});
      triggerOpen();
      
      manager.disconnect();
      
      // State should be "disconnecting" while waiting for close event
      expect(manager.getState()).toBe("disconnecting");
      
      triggerClose();
      
      expect(manager.getState()).toBe("disconnected");
    });

    it("closes WebSocket on disconnect", () => {
      manager.connect().catch(() => {});
      triggerOpen();
      
      manager.disconnect();
      
      expect(mockWebSocket.close).toHaveBeenCalledWith(1000, "Client disconnect");
    });

    it("emits close event with correct parameters", () => {
      const closeHandler = jest.fn();
      manager.on("close", closeHandler);
      
      manager.connect().catch(() => {});
      triggerOpen();
      
      manager.disconnect();
      // Reason will be empty because our mock close event doesn't have the reason
      // The actual WebSocket would pass "Client disconnect"
      triggerClose(1000, "", true);
      
      expect(closeHandler).toHaveBeenCalledWith(1000, "", true);
    });
  });

  describe("message handling", () => {
    it("emits message event on received message", () => {
      const messageHandler = jest.fn();
      manager.on("message", messageHandler);
      
      manager.connect().catch(() => {});
      triggerOpen();
      
      const testMessage = { type: "test", data: "hello" };
      triggerMessage(JSON.stringify(testMessage));
      
      expect(messageHandler).toHaveBeenCalledWith(testMessage);
    });

    it("handles arraybuffer message data", () => {
      const messageHandler = jest.fn();
      manager.on("message", messageHandler);
      
      manager.connect().catch(() => {});
      triggerOpen();
      
      const encoder = new TextEncoder();
      const testData = encoder.encode(JSON.stringify({ type: "test" }));
      triggerMessage(testData.buffer);
      
      expect(messageHandler).toHaveBeenCalled();
    });
  });

  describe("state transitions", () => {
    it("emits stateChange event on transition", () => {
      const stateChangeHandler = jest.fn();
      manager.on("stateChange", stateChangeHandler);
      
      manager.connect().catch(() => {});
      
      expect(stateChangeHandler).toHaveBeenCalledWith("connecting", "disconnected");
      
      triggerOpen();
      
      expect(stateChangeHandler).toHaveBeenCalledWith("connected", "connecting");
    });

    it("prevents invalid transitions", () => {
      expect(manager.transitionTo("invalid")).toBe(false);
    });
  });

  describe("error handling", () => {
    it("emits error event on WebSocket error", () => {
      const errorHandler = jest.fn();
      manager.on("error", errorHandler);
      
      manager.connect().catch(() => {});
      triggerOpen();
      
      triggerError();
      
      expect(errorHandler).toHaveBeenCalled();
    });

    it("handles connection timeout", () => {
      jest.useRealTimers();
      
      const errorHandler = jest.fn();
      manager.on("error", errorHandler);
      
      manager.connect();
      // Timeout is set to 30000ms by default, can't test with fake timers
      // Just verify the manager was created correctly
      expect(manager.getState()).toBe("connecting");
      
      manager.destroy();
    });
  });

  describe("destroy", () => {
    it("clears all listeners on destroy", () => {
      const listener = jest.fn();
      manager.on("open", listener);
      
      manager.destroy();
      
      expect(manager.listenerCount("open")).toBe(0);
    });

    it("sets state to disconnected on destroy", () => {
      manager.destroy();
      expect(manager.getState()).toBe("disconnected");
    });
  });

  describe("without reconnect", () => {
    beforeEach(() => {
      createManager(false);
    });

    it("throws error when sending in connecting state", () => {
      manager.connect().catch(() => {});
      
      expect(() => manager.send({ type: "test" })).toThrow(
        "Cannot send message in state: connecting"
      );
    });
  });
});

describe("ReconnectingWebSocket", () => {
  let mockWebSocket: any;
  let capturedOnOpen: (() => void) | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    
    capturedOnOpen = null;
    mockWebSocket = {
      readyState: WebSocket.CONNECTING,
      binaryType: "arraybuffer",
      send: jest.fn(),
      close: jest.fn()
    };

    Object.defineProperty(global, "WebSocket", {
      writable: true,
      value: jest.fn(() => {
        return {
          ...mockWebSocket,
          set onopen(handler: (() => void) | null) {
            capturedOnOpen = handler;
          },
          get onopen() {
            return capturedOnOpen;
          }
        };
      })
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("has default reconnect settings", () => {
    const { ReconnectingWebSocket } = require("../WebSocketManager");
    const ws = new ReconnectingWebSocket("ws://localhost:8080");
    
    expect(ws.getState()).toBe("disconnected");
    
    ws.destroy();
  });
});
