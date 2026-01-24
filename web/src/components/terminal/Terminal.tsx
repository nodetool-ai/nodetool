/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useEffect, useRef, useState, memo } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Box, Alert, Button } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { TERMINAL_URL } from "../../stores/BASE_URL";
import { isLocalhost } from "../../stores/ApiClient";
import "@xterm/xterm/css/xterm.css";
import log from "loglevel";
import { supabase } from "../../lib/supabaseClient";

interface TerminalMessage {
  type: "input" | "resize" | "ping" | "output" | "exit" | "error" | "pong";
  data?: string;
  cols?: number;
  rows?: number;
  code?: number;
  message?: string;
  ts?: number;
}

const styles = (theme: Theme) =>
  css({
    ".terminal-container": {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      backgroundColor: theme.palette.background.paper,
      padding: 0,
      minWidth: 0
    },
    ".terminal-wrapper": {
      flex: 1,
      position: "relative",
      overflow: "hidden",
      backgroundColor: "#000",
      padding: "8px"
    },
    ".terminal-error": {
      margin: "16px",
      maxWidth: "600px"
    },
    ".terminal-header": {
      padding: "8px 16px",
      backgroundColor: theme.palette.background.default,
      borderBottom: `1px solid ${theme.palette.divider}`,
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: "0.875rem",
      color: theme.palette.text.secondary
    },
    ".status-indicator": {
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      "&.connected": {
        backgroundColor: theme.palette.success.main
      },
      "&.disconnected": {
        backgroundColor: theme.palette.error.main
      },
      "&.connecting": {
        backgroundColor: theme.palette.warning.main
      }
    }
  });

export const Terminal: React.FC = () => {
  const theme = useTheme();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const viewportRef = useRef<HTMLElement | null>(null);
  const scrollDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const autoScrollRef = useRef(true);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const lastMeasuredSizeRef = useRef<{ width: number; height: number } | null>(null);
  const resizeDebounceRef = useRef<number | null>(null);
  const logResize = (
    label: string,
    dims?: { cols: number; rows: number } | null,
    prev?: { cols: number; rows: number } | null
  ) => {
    log.debug("[Terminal] resize", label, { dims, prev });
  };
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [isTerminalReady, setIsTerminalReady] = useState(false);
  const [isAutoScroll, setIsAutoScroll] = useState(true);

  useEffect(() => {
    autoScrollRef.current = isAutoScroll;
  }, [isAutoScroll]);

  useEffect(() => {
    if (!terminalRef.current) {return;}

    let fitTimeout: NodeJS.Timeout | null = null;

    // Initialize xterm
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#000000",
        foreground: "#ffffff",
        cursor: "#ffffff",
        cursorAccent: "#000000",
        selectionBackground: "rgba(255, 255, 255, 0.3)",
        black: "#000000",
        red: "#e06c75",
        green: "#98c379",
        yellow: "#d19a66",
        blue: "#61afef",
        magenta: "#c678dd",
        cyan: "#56b6c2",
        white: "#abb2bf",
        brightBlack: "#5c6370",
        brightRed: "#e06c75",
        brightGreen: "#98c379",
        brightYellow: "#d19a66",
        brightBlue: "#61afef",
        brightMagenta: "#c678dd",
        brightCyan: "#56b6c2",
        brightWhite: "#ffffff"
      },
      allowProposedApi: true
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(terminalRef.current);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    viewportRef.current = term.element?.querySelector(".xterm-viewport") as HTMLElement | null;

    // Track when user scrolls away from bottom
    scrollDisposableRef.current = term.onScroll(() => {
      const viewport = viewportRef.current;
      // Prefer DOM viewport check for accuracy
      if (viewport) {
        const atBottom =
          viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 4;
        autoScrollRef.current = atBottom;
        setIsAutoScroll(atBottom);
        return;
      }

      // Fallback: use buffer positions
      const buffer = term.buffer.active;
      const atBottomFallback =
        buffer.baseY + buffer.cursorY >= buffer.length - 1;
      autoScrollRef.current = atBottomFallback;
      setIsAutoScroll(atBottomFallback);
    });

    // Delay fit until after the DOM has fully rendered
    fitTimeout = setTimeout(() => {
      try {
        fitAddon.fit();
        setIsTerminalReady(true);
      } catch (err) {
        log.error("Failed to fit terminal:", err);
        setIsTerminalReady(true); // Still mark as ready to allow connection
      }
    }, 100);

    // Handle resize
    const handleResize: ResizeObserverCallback = (entries) => {
      if (resizeDebounceRef.current) {
        window.clearTimeout(resizeDebounceRef.current);
      }
      resizeDebounceRef.current = window.setTimeout(() => {
        resizeDebounceRef.current = null;

        if (!fitAddonRef.current) {
          return;
        }

        const entry = entries[0];
        const container = entry?.contentRect ?? terminalRef.current?.getBoundingClientRect();
        if (container) {
          const width = container.width;
          const height = container.height;
          const prevMeasured = lastMeasuredSizeRef.current;
          // Ignore tiny changes that can churn resizes due to scrollbars/pixel rounding
          if (
            prevMeasured &&
            Math.abs(prevMeasured.width - width) < 1 &&
            Math.abs(prevMeasured.height - height) < 1
          ) {
            return;
          }
          lastMeasuredSizeRef.current = { width, height };
        }

        try {
          // Only refit the terminal locally; do not send resize messages here
          // to avoid spamming the backend when layout jitters.
          fitAddonRef.current.fit();
        } catch (err) {
          log.error("Failed to resize terminal:", err);
        }
      }, 80);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    // Cleanup
    return () => {
      if (fitTimeout) {
        clearTimeout(fitTimeout);
      }
      if (scrollDisposableRef.current) {
        scrollDisposableRef.current.dispose();
        scrollDisposableRef.current = null;
      }
      if (resizeDebounceRef.current) {
        window.clearTimeout(resizeDebounceRef.current);
        resizeDebounceRef.current = null;
      }
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      setIsTerminalReady(false);
    };
  }, []);

  const sendMessage = useCallback((msg: TerminalMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        if (msg.type === "resize") {
          const dims = { cols: msg.cols ?? 0, rows: msg.rows ?? 0 };
          logResize("sendMessage", dims, lastSizeRef.current);
        }
        wsRef.current.send(JSON.stringify(msg));
      } catch (err) {
        log.error("Failed to send message:", err);
      }
    }
  }, []);

  useEffect(() => {
    if (!isTerminalReady || !xtermRef.current) {return;}

    let disposable: { dispose: () => void } | null = null;

    const connectWebSocket = async () => {
      const term = xtermRef.current;
      if (!term) {return;}

      // Build WebSocket URL
      // In production, add auth token as query param
      // In dev mode, backend skips auth check
      let wsUrl = TERMINAL_URL;

      if (!isLocalhost) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const url = new URL(wsUrl, window.location.origin);
          url.searchParams.set("token", session.access_token);
          wsUrl = url.toString().replace(/^http/, "ws");
        }
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      setStatus("connecting");
      setError(null);

      ws.onopen = () => {
        log.info("Terminal WebSocket connected");
        setStatus("connected");
        setError(null);

        // Send initial resize
        const fitAddon = fitAddonRef.current;
        if (fitAddon) {
          fitAddon.fit();
          const dims = fitAddon.proposeDimensions();
          if (dims) {
            const prev = lastSizeRef.current;
            if (!prev || prev.cols !== dims.cols || prev.rows !== dims.rows) {
              const container = terminalRef.current;
              if (container) {
                const { width, height } = container.getBoundingClientRect();
                lastMeasuredSizeRef.current = { width, height };
              }
              lastSizeRef.current = { cols: dims.cols, rows: dims.rows };
              sendMessage({
                type: "resize",
                cols: dims.cols,
                rows: dims.rows
              });
              logResize("open-sent", dims, prev);
            }
          }
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg: TerminalMessage = JSON.parse(event.data);

          switch (msg.type) {
            case "output":
              if (msg.data) {
                term.write(msg.data);
                if (autoScrollRef.current) {
                  term.scrollToBottom();
                }
              }
              break;

            case "exit":
              term.write(`\r\n\n[Process exited with code ${msg.code ?? 0}]\r\n`);
              term.write("[Session ended. Close and reopen this panel to start a new session.]\r\n");
              if (autoScrollRef.current) {
                term.scrollToBottom();
              }
              ws.close();
              break;

            case "error":
              log.error("Terminal error:", msg.message);
              setError(msg.message ?? "Unknown error");
              break;

            case "pong":
              // Handle pong if needed
              break;

            default:
              log.warn("Unknown message type:", msg.type);
          }
        } catch (err) {
          log.error("Failed to parse message:", err);
        }
      };

      ws.onerror = (event) => {
        log.error("Terminal WebSocket error:", event);
        setStatus("disconnected");
      };

      ws.onclose = (event) => {
        log.info("Terminal WebSocket closed:", event.code, event.reason);
        setStatus("disconnected");

        // Provide helpful error messages
        if (event.code === 1006) {
          setError("Connection failed. Make sure the backend server is running.");
        } else if (event.code === 1008) {
          if (event.reason.includes("disabled")) {
            setError("Terminal disabled. Restart the backend server to enable terminal access.");
          } else {
            setError(`Access denied: ${event.reason}`);
          }
        } else if (event.reason) {
          setError(`Connection closed: ${event.reason}`);
        }
      };

      // Handle terminal input
      disposable = term.onData((data) => {
        sendMessage({
          type: "input",
          data
        });
      });
    };

    connectWebSocket();

    // Cleanup
    return () => {
      if (disposable) {
        disposable.dispose();
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isTerminalReady, sendMessage]);

  const handleReconnect = useCallback(() => {
    // Force re-render to trigger reconnection
    setIsTerminalReady(false);
    setTimeout(() => {
      if (terminalRef.current && xtermRef.current) {
        setIsTerminalReady(true);
      }
    }, 100);
  }, []);

  return (
    <Box css={styles(theme)} className="terminal-container">
      <div className="terminal-header">
        <div className={`status-indicator ${status}`} />
        <span>
          Terminal {status === "connected" ? "Connected" : status === "connecting" ? "Connecting..." : "Disconnected"}
        </span>
        <span style={{ marginLeft: 8, fontSize: "0.8em", opacity: 0.7 }}>
          {isAutoScroll ? "auto-scroll ON" : "auto-scroll OFF"}
        </span>
        {status === "disconnected" && (
          <Button size="small" variant="outlined" onClick={handleReconnect}>
            Reconnect
          </Button>
        )}
      </div>
      {error && (
        <Alert severity="error" className="terminal-error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <div className="terminal-wrapper" ref={terminalRef} />
    </Box>
  );
};

export default memo(Terminal);
