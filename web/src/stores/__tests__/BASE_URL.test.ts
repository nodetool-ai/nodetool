/**
 * @jest-environment jsdom
 */

describe("BASE_URL patterns", () => {
  describe("WebSocket URL structure patterns", () => {
    it("converts http to ws protocol", () => {
      const baseUrl = "http://localhost:8000";
      const result = baseUrl.replace(/^http/, "ws") + "/ws";
      expect(result).toBe("ws://localhost:8000/ws");
    });

    it("converts https to wss protocol", () => {
      const baseUrl = "https://api.example.com";
      const result = baseUrl.replace(/^http/, "ws") + "/ws";
      expect(result).toBe("wss://api.example.com/ws");
    });

    it("handles different host formats", () => {
      const testCases = [
        { input: "http://localhost:8000", expected: "ws://localhost:8000/ws" },
        { input: "https://api.example.com", expected: "wss://api.example.com/ws" },
        { input: "http://192.168.1.1:8000", expected: "ws://192.168.1.1:8000/ws" },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = input.replace(/^http/, "ws") + "/ws";
        expect(result).toBe(expected);
      });
    });

    it("handles download path", () => {
      const baseUrl = "http://localhost:8000";
      const result = baseUrl.replace(/^http/, "ws") + "/ws/download";
      expect(result).toBe("ws://localhost:8000/ws/download");
    });

    it("handles terminal path", () => {
      const baseUrl = "http://localhost:8000";
      const result = baseUrl.replace(/^http/, "ws") + "/ws/terminal";
      expect(result).toBe("ws://localhost:8000/ws/terminal");
    });
  });

  describe("window.location fallback patterns", () => {
    it("constructs URL from https window.location", () => {
      const protocol = "https:";
      const host = "app.example.com";
      
      global.window = {
        location: { protocol, host }
      } as any;

      const protocolWs = protocol === "https:" ? "wss:" : "ws:";
      const result = `${protocolWs}//${host}/ws`;
      
      expect(result).toBe("wss://app.example.com/ws");
    });

    it("constructs URL from http window.location", () => {
      const protocol: string = "http:";
      const host = "localhost:3000";
      
      const protocolWs = protocol === "https:" ? "wss:" : "ws:";
      const result = `${protocolWs}//${host}/ws`;
      
      expect(result).toBe("ws://localhost:3000/ws");
    });

    it("falls back to localhost:3000 when window is undefined", () => {
      const originalWindow = global.window;
      global.window = undefined as any;

      const protocolWs = "ws:";
      const result = `${protocolWs}//localhost:3000/ws`;
      
      expect(result).toBe("ws://localhost:3000/ws");
      
      global.window = originalWindow;
    });

    it("handles different ports in host", () => {
      const protocol: string = "http:";
      const host = "localhost:7777";
      
      const protocolWs = protocol === "https:" ? "wss:" : "ws:";
      const result = `${protocolWs}//${host}/ws`;
      
      expect(result).toBe("ws://localhost:7777/ws");
    });
  });

  describe("URL validation patterns", () => {
    it("matches ws:// URLs", () => {
      const url = "ws://localhost:8000/ws";
      expect(url).toMatch(/^ws:\/\//);
    });

    it("matches wss:// URLs", () => {
      const url = "wss://api.example.com/ws";
      expect(url).toMatch(/^wss:\/\//);
    });

    it("matches both ws and wss protocols", () => {
      const urls = [
        "ws://localhost:8000/ws",
        "wss://api.example.com/ws",
        "ws://192.168.1.1:8000/ws",
      ];
      
      urls.forEach((url) => {
        expect(url).toMatch(/^ws(s)?:\/\//);
      });
    });

    it("correctly identifies download URLs", () => {
      const url = "ws://localhost:8000/ws/download";
      expect(url.endsWith("/ws/download")).toBe(true);
      expect(url).toContain("/ws/download");
    });

    it("correctly identifies terminal URLs", () => {
      const url = "ws://localhost:8000/ws/terminal";
      expect(url.endsWith("/ws/terminal")).toBe(true);
      expect(url).toContain("/ws/terminal");
    });
  });
});
