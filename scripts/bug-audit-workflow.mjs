export const meta = {
  name: 'kernel-runtime-bug-audit',
  description: 'Find + adversarially verify real bugs across kernel/runtime/agents/websocket',
  phases: [
    { title: 'Find' },
    { title: 'Verify' },
  ],
}

// args: { round: number, exclude: [{file, title}], focusNote?: string }
const round = (args && args.round) || 1
const exclude = (args && args.exclude) || []
const focusNote = (args && args.focusNote) || ''

const excludeText = exclude.length
  ? `\n\nALREADY-REPORTED / ALREADY-FIXED bugs — do NOT re-report these (find NEW, distinct issues):\n` +
    exclude.map((e) => `- ${e.file}: ${e.title}`).join('\n')
  : ''

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
          file: { type: 'string', description: 'repo-relative path' },
          line: { type: 'integer', description: '1-indexed line the bug anchors to' },
          title: { type: 'string', description: 'one-line summary of the defect' },
          category: {
            type: 'string',
            enum: ['correctness', 'race-condition', 'resource-leak', 'error-handling', 'security'],
          },
          description: { type: 'string', description: 'what the code does wrong and why' },
          failureScenario: { type: 'string', description: 'concrete inputs/state -> wrong output/crash/leak' },
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
    refuted: {
      type: 'boolean',
      description: 'true if this is NOT a real bug (false positive, intended behavior, cannot actually occur)',
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reasoning: { type: 'string', description: 'evidence from the actual code for the verdict' },
  },
  required: ['refuted', 'confidence', 'reasoning'],
}

const FINDER_PREAMBLE = `You are a senior bug hunter auditing a TypeScript backend (Node.js, ES modules, actor-model workflow engine). Your job: find REAL, CONCRETE bugs — defects that produce wrong results, crashes, hangs, races, leaked resources, or security holes under realistic conditions.

Rules:
- Read the actual source files with the Read tool before reporting. Cite exact file + line.
- Report ONLY genuine defects. NOT style, naming, "could be cleaner", missing docs, or speculative "might be nice".
- Each finding must have a concrete failure scenario: specific inputs/state that trigger wrong behavior.
- Prefer high-severity, high-confidence bugs. Report at most 6 findings, best first.
- If you find nothing solid, return an empty findings array. Do not pad.
- These files are under /home/user/nodetool/. Use repo-relative paths in output.${excludeText}${focusNote ? '\n\nFOCUS NOTE for this round: ' + focusNote : ''}`

// Each finder: a subsystem slice + an error-class lens. Finders may report any
// real bug they see, but should lead with their lens.
const FINDERS = [
  {
    key: 'kernel-actor-races',
    lens: 'race conditions & actor-message ordering',
    files: ['packages/kernel/src/actor.ts', 'packages/kernel/src/inbox.ts', 'packages/kernel/src/durable-inbox.ts'],
  },
  {
    key: 'kernel-runner-lifecycle',
    lens: 'correctness, resource leaks, lifecycle/suspend-resume',
    files: ['packages/kernel/src/runner.ts', 'packages/kernel/src/suspendable.ts', 'packages/kernel/src/trigger-manager.ts', 'packages/kernel/src/trigger-wakeup.ts', 'packages/kernel/src/trigger.ts'],
  },
  {
    key: 'kernel-graph',
    lens: 'correctness (graph algorithms, cycle detection, topo sort, edge routing)',
    files: ['packages/kernel/src/graph.ts', 'packages/kernel/src/graph-utils.ts', 'packages/kernel/src/correlation-analysis.ts', 'packages/kernel/src/io.ts'],
  },
  {
    key: 'runtime-context',
    lens: 'correctness, resource leaks, error handling',
    files: ['packages/runtime/src/context.ts'],
  },
  {
    key: 'runtime-providers',
    lens: 'error handling & correctness (streaming, token/usage accounting, retries, aborts)',
    files: ['packages/runtime/src/providers/base-provider.ts', 'packages/runtime/src/providers/openai-provider.ts', 'packages/runtime/src/providers/anthropic-provider.ts'],
  },
  {
    key: 'runtime-python-bridge',
    lens: 'resource leaks, races, error handling (subprocess lifecycle, msgpack framing, stdio)',
    files: ['packages/runtime/src/python-bridge-base.ts', 'packages/runtime/src/python-websocket-bridge.ts'],
  },
  {
    key: 'runtime-security',
    lens: 'security (injection, path traversal, unsafe deserialization, secret leakage, SSRF)',
    files: ['packages/runtime/src/prompt-asset-refs.ts', 'packages/runtime/src/comfy-executor.ts'],
  },
  {
    key: 'agents-executor',
    lens: 'race conditions & correctness (parallel step execution, task DAG, cancellation)',
    files: ['packages/agents/src/step-executor.ts', 'packages/agents/src/task-executor.ts', 'packages/agents/src/parallel-task-executor.ts'],
  },
  {
    key: 'agents-sandbox-tools',
    lens: 'security (sandbox escape, path traversal, command/eval injection, unbounded resource use)',
    files: ['packages/agents/src/js-sandbox.ts', 'packages/agents/src/tools/filesystem-tools.ts', 'packages/agents/src/tools/edit-search-tools.ts'],
  },
  {
    key: 'agents-memory-planner',
    lens: 'correctness & resource leaks (memory store, checkpoints, planning JSON)',
    files: ['packages/agents/src/long-term-memory.ts', 'packages/agents/src/checkpoint-store.ts', 'packages/agents/src/task-planner.ts', 'packages/agents/src/graph-planner.ts'],
  },
  {
    key: 'ws-runner',
    lens: 'race conditions, resource leaks, correctness (job lifecycle, socket cleanup, streaming)',
    files: ['packages/websocket/src/unified-websocket-runner.ts'],
  },
  {
    key: 'ws-api-security',
    lens: 'security (auth/authz bypass, injection, SSRF, path traversal) & error handling',
    files: ['packages/websocket/src/http-api.ts', 'packages/websocket/src/oauth-api.ts', 'packages/websocket/src/mcp-server.ts'],
  },
  {
    key: 'ws-media-servers',
    lens: 'resource leaks & security (browser/process lifecycle, temp files, unbounded input)',
    files: ['packages/websocket/src/screenshot-server.ts', 'packages/websocket/src/lib/workflow-bundle.ts'],
  },
]

phase('Find')

function verdictKey(v) {
  return v && v.refuted === false
}

// pipeline: each finder finds, then each of its findings is adversarially
// verified by 3 independent skeptics as soon as that finder completes.
const results = await pipeline(
  FINDERS,
  (finder) =>
    agent(
      `${FINDER_PREAMBLE}\n\nYour lens: ${finder.lens}\nYour files (read all of them):\n${finder.files.map((f) => '- ' + f).join('\n')}\n\nHunt for bugs. Return structured findings.`,
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
              `You are an adversarial skeptic (reviewer #${i + 1} of 3). A bug hunter claims the following is a REAL bug. Your DEFAULT stance is skepticism: try hard to REFUTE it. Read the actual code before judging.\n\nClaimed bug:\n- File: ${f.file}:${f.line}\n- Category: ${f.category}\n- Title: ${f.title}\n- Description: ${f.description}\n- Failure scenario: ${f.failureScenario}\n\nRead ${f.file} (and any related code needed) and decide: is this a REAL defect that can actually occur and produce the claimed wrong behavior? Set refuted=true if it is a false positive, intended/guarded behavior, cannot actually be reached, or the failure scenario does not hold. Set refuted=false ONLY if you independently confirm it is a genuine bug. Give code-grounded reasoning.`,
              { label: `verify:${finder.key}#${i}`, phase: 'Verify', schema: VERDICT_SCHEMA },
            ),
          ),
        ).then((verdicts) => {
          const valid = verdicts.filter(Boolean)
          const confirms = valid.filter(verdictKey).length
          const refutes = valid.filter((v) => v && v.refuted === true).length
          return {
            ...f,
            finder: finder.key,
            verdicts: valid,
            confirmVotes: confirms,
            refuteVotes: refutes,
            confirmed: confirms >= 2,
          }
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
