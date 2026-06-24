/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { TerminalBuffer } from "../../stores/ResultsStore";
import { BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";

/**
 * Read-only terminal emulator for node bodies, fed by `terminal_update`
 * messages (raw ANSI pane stream from e.g. the Claude Code tmux node).
 *
 * The accumulated buffer lives in ResultsStore; this component writes only
 * the unseen suffix on each update, and resets + replays when the buffer was
 * replaced (snapshot) or trimmed — signalled by `version`.
 */
interface NodeTerminalProps {
  terminal: TerminalBuffer;
}

const terminalCss = css({
  marginTop: "0.5em",
  maxHeight: "320px",
  overflow: "auto",
  borderRadius: BORDER_RADIUS.sm,
  // xterm renders its own dark background; pad it out to the node edge.
  backgroundColor: "#1e1e1e",
  padding: getSpacingPx(SPACING.xs),
  ".xterm": {
    fontSize: "var(--fontSizeSmaller)"
  }
});

const NodeTerminal: React.FC<NodeTerminalProps> = memo(({ terminal }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const writtenRef = useRef(0);
  const versionRef = useRef(-1);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const term = new Terminal({
      cols: terminal.cols,
      rows: terminal.rows,
      disableStdin: true,
      scrollback: 1000,
      fontSize: 10,
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
      theme: { background: "#1e1e1e" }
    });
    term.open(containerRef.current);
    termRef.current = term;
    writtenRef.current = 0;
    versionRef.current = -1;
    return () => {
      term.dispose();
      termRef.current = null;
    };
    // The terminal instance is created once; geometry changes are applied via
    // resize() below and content via write() — never by recreating it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    termRef.current?.resize(terminal.cols, terminal.rows);
  }, [terminal.cols, terminal.rows]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (terminal.version !== versionRef.current) {
      // Replay from scratch when the buffer was replaced/trimmed. Skip the
      // reset when nothing has been written yet (fresh emulator).
      if (writtenRef.current > 0) term.reset();
      writtenRef.current = 0;
      versionRef.current = terminal.version;
    }
    if (terminal.buffer.length > writtenRef.current) {
      term.write(terminal.buffer.slice(writtenRef.current));
      writtenRef.current = terminal.buffer.length;
    }
  }, [terminal.buffer, terminal.version]);

  return (
    <div
      className="node-terminal nodrag nowheel"
      data-testid="node-terminal"
      ref={containerRef}
      css={terminalCss}
    />
  );
});

NodeTerminal.displayName = "NodeTerminal";

export default NodeTerminal;
