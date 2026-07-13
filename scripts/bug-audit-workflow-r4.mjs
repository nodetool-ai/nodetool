export const meta = {
  name: 'kernel-runtime-bug-audit-r4',
  description: 'Round 4: find + adversarially verify bugs in previously-unexamined files',
  phases: [{ title: 'Find' }, { title: 'Verify' }],
}

const round = (args && args.round) || 4
const focusNote = (args && args.focusNote) || ''

const FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          title: { type: 'string' },
          category: { type: 'string', enum: ['correctness', 'race-condition', 'resource-leak', 'error-handling', 'security'] },
          description: { type: 'string' },
          failureScenario: { type: 'string' },
          suggestedFix: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['file', 'line', 'title', 'category', 'description', 'failureScenario', 'suggestedFix', 'severity'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    refuted: { type: 'boolean' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reasoning: { type: 'string' },
  },
  required: ['refuted', 'confidence', 'reasoning'],
}

const PREAMBLE = `You are a senior bug hunter auditing a TypeScript backend (Node.js, ES modules, actor-model workflow engine). Find REAL, CONCRETE bugs — wrong results, crashes, hangs, races, leaked resources, security holes under realistic conditions.

Rules:
- Read the actual source files with Read before reporting. Cite exact file + line.
- Report ONLY genuine defects with a concrete failure scenario. NOT style/naming/docs.
- Prefer high-severity, high-confidence. At most 6 findings, best first. Empty array if nothing solid — do not pad.
- Repo-relative paths. Files under /home/user/nodetool/.
- IMPORTANT: rounds 1-3 already fixed 60 bugs (AbortSignal forwarding, prototype-pollution via \`in\`/bracket on outputs/ext maps, symlink escapes with realpath containment, ReDoS, zip-bomb, IDOR, oauth ciphertext, job-slot try/finally, fan-out ordering/dedup, plan-cache clone/key, reconnect epoch, per-tool error isolation, etc.). Do NOT re-report those patterns where already fixed. Report NEW distinct defects.${focusNote ? '\n\n' + focusNote : ''}`

const FINDERS = [
  { key: 'kernel-inbox-io', lens: 'races, correctness, resource leaks (durable inbox, io, suspend/resume)', files: ['packages/kernel/src/durable-inbox.ts', 'packages/kernel/src/inbox.ts', 'packages/kernel/src/suspendable.ts', 'packages/kernel/src/io.ts'] },
  { key: 'kernel-correlation', lens: 'correctness (correlation analysis, message routing)', files: ['packages/kernel/src/correlation-analysis.ts'] },
  { key: 'runtime-gemini', lens: 'correctness, error-handling (streaming, tool loop, usage, parts round-trip)', files: ['packages/runtime/src/providers/gemini-provider.ts'] },
  { key: 'runtime-media-providers', lens: 'error-handling, resource leaks, security/SSRF (media generation, polling, downloads)', files: ['packages/runtime/src/providers/fal-provider.ts', 'packages/runtime/src/providers/replicate-provider.ts'] },
  { key: 'runtime-comfy-asset', lens: 'races, resource leaks, correctness (comfy executor, prompt asset edges)', files: ['packages/runtime/src/comfy-executor.ts', 'packages/runtime/src/prompt-asset-refs.ts'] },
  { key: 'agents-step-executor', lens: 'correctness, races (step execution, tool loop, result capture, cancellation)', files: ['packages/agents/src/step-executor.ts'] },
  { key: 'agents-agent-graphplanner', lens: 'correctness, error-handling (agent orchestration, graph planning, compiler)', files: ['packages/agents/src/agent.ts', 'packages/agents/src/graph-planner.ts', 'packages/agents/src/compiler-agent.ts'] },
  { key: 'agents-mcp-media-tools', lens: 'security (SSRF, path traversal, injection), resource leaks (mcp, media, pdf tools)', files: ['packages/agents/src/tools/mcp-tools.ts', 'packages/agents/src/tools/media-tools.ts', 'packages/agents/src/tools/pdf-tools.ts'] },
  { key: 'agents-vector-fs-tools', lens: 'security (path traversal), correctness (vector + filesystem tools)', files: ['packages/agents/src/tools/vector-tools.ts', 'packages/agents/src/tools/filesystem-tools.ts'] },
  { key: 'ws-server', lens: 'races, resource leaks, error-handling (server lifecycle, connection handling)', files: ['packages/websocket/src/server.ts'] },
  { key: 'ws-models-openai-api', lens: 'security (auth, SSRF), error-handling (models api, openai-compatible api)', files: ['packages/websocket/src/models-api.ts', 'packages/websocket/src/openai-api.ts'] },
  { key: 'ws-screenshot-llm-agent', lens: 'resource leaks (browser/process lifecycle), correctness (screenshot server, llm agent)', files: ['packages/websocket/src/screenshot-server.ts', 'packages/websocket/src/agent/llm-agent.ts'] },
]

phase('Find')
const verdictKey = (v) => v && v.refuted === false

const results = await pipeline(
  FINDERS,
  (finder) =>
    agent(
      `${PREAMBLE}\n\nYour lens: ${finder.lens}\nYour files (read all):\n${finder.files.map((f) => '- ' + f).join('\n')}\n\nHunt for bugs. Return structured findings.`,
      { label: `find:${finder.key}`, phase: 'Find', schema: FINDING_SCHEMA },
    ),
  (findResult, finder) => {
    const findings = (findResult && findResult.findings) || []
    if (!findings.length) return []
    return parallel(
      findings.map((f) => () =>
        parallel(
          [0, 1, 2].map((i) => () =>
            agent(
              `You are an adversarial skeptic (reviewer #${i + 1} of 3). A bug hunter claims the following is a REAL bug. DEFAULT to skepticism: try hard to REFUTE it. Read the actual code first.\n\nClaimed bug:\n- File: ${f.file}:${f.line}\n- Category: ${f.category}\n- Title: ${f.title}\n- Description: ${f.description}\n- Failure scenario: ${f.failureScenario}\n\nRead ${f.file} and related code. Set refuted=true if it's a false positive, intended/guarded behavior, unreachable, or the scenario doesn't hold. Set refuted=false ONLY if you independently confirm a genuine bug. Give code-grounded reasoning.`,
              { label: `verify:${finder.key}#${i}`, phase: 'Verify', schema: VERDICT_SCHEMA },
            ),
          ),
        ).then((verdicts) => {
          const valid = verdicts.filter(Boolean)
          const confirms = valid.filter(verdictKey).length
          return { ...f, finder: finder.key, verdicts: valid, confirmVotes: confirms, confirmed: confirms >= 2 }
        }),
      ),
    )
  },
)

const flat = results.flat().filter(Boolean)
const confirmed = flat.filter((x) => x.confirmed)
const refuted = flat.filter((x) => !x.confirmed)
log(`Round ${round}: ${flat.length} findings verified, ${confirmed.length} confirmed (>=2/3), ${refuted.length} refuted`)
return { round, confirmed, refuted, totalFindings: flat.length }
