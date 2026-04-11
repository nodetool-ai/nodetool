#!/bin/sh
# ==========================================================================
# Firecracker Guest Agent — execute.sh
#
# Handles a single code execution request. Invoked by socat for each vsock
# connection. Reads a JSON request from stdin, executes the code, and writes
# JSON-line responses to stdout.
#
# Protocol:
#   Input  (one JSON line):
#     {"action":"exec","language":"python","code":"...","env":{"x":1},"timeout":10}
#
#   Output (JSON lines):
#     {"type":"stdout","data":"...\n"}
#     {"type":"stderr","data":"...\n"}
#     {"type":"exit","code":0}
# ==========================================================================

set -e

# Read the single-line JSON request
read -r REQUEST

# Parse fields with jq
LANGUAGE=$(printf '%s' "$REQUEST" | jq -r '.language // "bash"')
CODE=$(printf '%s' "$REQUEST" | jq -r '.code // ""')
TIMEOUT=$(printf '%s' "$REQUEST" | jq -r '.timeout // 10')
ENV_JSON=$(printf '%s' "$REQUEST" | jq -c '.env // {}')

# Create a temporary script file
TMPDIR=$(mktemp -d)
SCRIPT_FILE="${TMPDIR}/code"

# --------------------------------------------------------------------------
# Determine interpreter and write the script
# --------------------------------------------------------------------------
case "$LANGUAGE" in
  python|python3)
    INTERPRETER="python3"
    # Inject env locals as Python assignments
    printf '%s' "$ENV_JSON" | jq -r 'to_entries[] | "\(.key) = \(.value | @json | fromjson | tojson)"' > "$SCRIPT_FILE" 2>/dev/null || true
    printf '%s\n' "$CODE" >> "$SCRIPT_FILE"
    CMD="$INTERPRETER $SCRIPT_FILE"
    ;;
  javascript|js|node)
    INTERPRETER="node"
    # Inject env locals as const declarations
    printf '%s' "$ENV_JSON" | jq -r 'to_entries[] | "const \(.key) = \(.value | tojson);"' > "$SCRIPT_FILE" 2>/dev/null || true
    printf '%s\n' "$CODE" >> "$SCRIPT_FILE"
    CMD="$INTERPRETER $SCRIPT_FILE"
    ;;
  bash|sh)
    INTERPRETER="bash"
    printf 'set -e\n' > "$SCRIPT_FILE"
    # Inject env locals as shell variable assignments
    printf '%s' "$ENV_JSON" | jq -r 'to_entries[] | "\(.key)=\(.value | tojson)"' >> "$SCRIPT_FILE" 2>/dev/null || true
    printf '%s\n' "$CODE" >> "$SCRIPT_FILE"
    CMD="$INTERPRETER $SCRIPT_FILE"
    ;;
  ruby)
    INTERPRETER="ruby"
    # Inject env locals as Ruby assignments
    printf '%s' "$ENV_JSON" | jq -r 'to_entries[] | "\(.key) = \(.value | tojson)"' > "$SCRIPT_FILE" 2>/dev/null || true
    printf '%s\n' "$CODE" >> "$SCRIPT_FILE"
    CMD="$INTERPRETER $SCRIPT_FILE"
    ;;
  lua)
    INTERPRETER="lua"
    # Inject env locals as Lua assignments
    printf '%s' "$ENV_JSON" | jq -r 'to_entries[] | "local \(.key) = \(.value | tojson)"' > "$SCRIPT_FILE" 2>/dev/null || true
    printf '%s\n' "$CODE" >> "$SCRIPT_FILE"
    CMD="$INTERPRETER $SCRIPT_FILE"
    ;;
  *)
    printf '{"type":"stderr","data":"Unsupported language: %s\\n"}\n' "$LANGUAGE"
    printf '{"type":"exit","code":1}\n'
    rm -rf "$TMPDIR"
    exit 0
    ;;
esac

# --------------------------------------------------------------------------
# Execute with timeout, capturing stdout and stderr separately
# --------------------------------------------------------------------------
STDOUT_FIFO="${TMPDIR}/stdout"
STDERR_FIFO="${TMPDIR}/stderr"
mkfifo "$STDOUT_FIFO" "$STDERR_FIFO"

# Background: read stdout and emit JSON lines
(while IFS= read -r line; do
  # Escape backslashes, quotes, and control chars for JSON
  escaped=$(printf '%s' "$line" | jq -Rs '.')
  printf '{"type":"stdout","data":%s}\n' "$escaped"
done < "$STDOUT_FIFO") &
STDOUT_PID=$!

# Background: read stderr and emit JSON lines
(while IFS= read -r line; do
  escaped=$(printf '%s' "$line" | jq -Rs '.')
  printf '{"type":"stderr","data":%s}\n' "$escaped"
done < "$STDERR_FIFO") &
STDERR_PID=$!

# Run the code with timeout, redirecting stdout/stderr to FIFOs
EXIT_CODE=0
timeout "$TIMEOUT" sh -c "$CMD" > "$STDOUT_FIFO" 2> "$STDERR_FIFO" || EXIT_CODE=$?

# Handle timeout (exit code 124 from timeout command)
if [ "$EXIT_CODE" -eq 124 ]; then
  # Wait for readers to finish
  wait "$STDOUT_PID" 2>/dev/null || true
  wait "$STDERR_PID" 2>/dev/null || true
  printf '{"type":"stderr","data":"Execution timed out after %s seconds\\n"}\n' "$TIMEOUT"
  printf '{"type":"exit","code":124}\n'
  rm -rf "$TMPDIR"
  exit 0
fi

# Wait for output readers to drain
wait "$STDOUT_PID" 2>/dev/null || true
wait "$STDERR_PID" 2>/dev/null || true

# Emit exit message
printf '{"type":"exit","code":%d}\n' "$EXIT_CODE"

# Cleanup
rm -rf "$TMPDIR"
exit 0
