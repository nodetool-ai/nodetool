export const meta = {
  name: 'kernel-runtime-bug-audit-r5',
  description: 'Round 5: find + adversarially verify bugs in the remaining unexamined files',
  phases: [{ title: 'Find' }, { title: 'Verify' }],
}

const round = (args && args.round) || 5
const focusNote = (args && args.focusNote) || ''

const FINDING_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { findings: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    properties: {
      file: { type: 'string' }, line: { type: 'integer' }, title: { type: 'string' },
      category: { type: 'string', enum: ['correctness', 'race-condition', 'resource-leak', 'error-handling', 'security'] },
      description: { type: 'string' }, failureScenario: { type: 'string' }, suggestedFix: { type: 'string' },
      severity: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
    required: ['file', 'line', 'title', 'category', 'description', 'failureScenario', 'suggestedFix', 'severity'],
  } } },
  required: ['findings'],
}
const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { refuted: { type: 'boolean' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, reasoning: { type: 'string' } },
  required: ['refuted', 'confidence', 'reasoning'],
}

const PREAMBLE = `You are a senior bug hunter auditing a TypeScript backend (Node.js, ES modules, actor-model workflow engine). Find REAL, CONCRETE bugs — wrong results, crashes, hangs, races, leaked resources, security holes under realistic conditions.

Rules:
- Read the actual source files with Read before reporting. Cite exact file + line.
- Report ONLY genuine defects with a concrete failure scenario. NOT style/naming/docs.
- Prefer high-severity, high-confidence. At most 6 findings, best first. Empty array if nothing solid — do not pad.
- Repo-relative paths. Files under /home/user/nodetool/.
- Rounds 1-4 fixed 73 bugs (AbortSignal forwarding, prototype-pollution via \`in\`, symlink escapes, ReDoS, zip-bomb, IDOR, oauth ciphertext, job-slot try/finally, per-tool error isolation, token-usage tracking, path traversal, etc.). Do NOT re-report those patterns where already fixed. Report NEW distinct defects.${focusNote ? '\n\n' + focusNote : ''}`

const FINDERS = [
  { key: 'providers-openai-compat', lens: 'correctness, error-handling (streaming, tool loop, usage, abort) in OpenAI-compatible providers', files: ['packages/runtime/src/providers/mistral-provider.ts', 'packages/runtime/src/providers/together-provider.ts', 'packages/runtime/src/providers/ollama-provider.ts'] },
  { key: 'providers-media-agent', lens: 'correctness, resource-leak, security (media gen, polling, SDK subprocess)', files: ['packages/runtime/src/providers/kie-provider.ts', 'packages/runtime/src/providers/minimax-provider.ts', 'packages/runtime/src/providers/claude-agent-provider.ts'] },
  { key: 'providers-hf-codex', lens: 'error-handling, correctness (huggingface, codex providers)', files: ['packages/runtime/src/providers/huggingface-provider.ts', 'packages/runtime/src/providers/codex-provider.ts'] },
  { key: 'runtime-python-exec', lens: 'races, correctness, resource-leak (python node execution, graph resolution)', files: ['packages/runtime/src/python-node-executor.ts', 'packages/runtime/src/python-graph-resolver.ts'] },
  { key: 'runtime-cost', lens: 'correctness (cost calculation, pricing, token math)', files: ['packages/runtime/src/cost-calculator.ts'] },
  { key: 'agents-tools-misc', lens: 'security (SSRF, injection), correctness (dataseo, math, plan-builder tools)', files: ['packages/agents/src/tools/dataseo-tools.ts', 'packages/agents/src/tools/math-tools.ts', 'packages/agents/src/tools/plan-builder-tools.ts'] },
  { key: 'ws-trpc-models', lens: 'security (auth, path traversal, SSRF), error-handling (models tRPC router)', files: ['packages/websocket/src/trpc/routers/models.ts'] },
  { key: 'ws-trpc-workflows', lens: 'security (authz/IDOR), correctness (workflows tRPC router)', files: ['packages/websocket/src/trpc/routers/workflows.ts'] },
  { key: 'ws-trpc-sketch-timeline', lens: 'security (authz), correctness, resource-leak (sketch, timeline, sandboxes routers)', files: ['packages/websocket/src/trpc/routers/sketch.ts', 'packages/websocket/src/trpc/routers/timeline.ts', 'packages/websocket/src/trpc/routers/sandboxes.ts'] },
  { key: 'ws-test-ui-server', lens: 'resource-leak, security (browser/process lifecycle, temp files, test-ui server)', files: ['packages/websocket/src/test-ui-server.ts'] },
  { key: 'ws-pi-agent-settings', lens: 'correctness, resource-leak, security (pi-agent, settings registry, websocket plugin)', files: ['packages/websocket/src/agent/pi-agent.ts', 'packages/websocket/src/settings-registry.ts', 'packages/websocket/src/plugins/websocket.ts'] },
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
