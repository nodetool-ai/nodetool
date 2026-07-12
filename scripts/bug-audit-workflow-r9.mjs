export const meta = {
  name: 'kernel-runtime-bug-audit-r9',
  description: 'Round 9: find + adversarially verify bugs in files not swept in rounds 1-8',
  phases: [{ title: 'Find' }, { title: 'Verify' }],
}

const round = (args && args.round) || 9
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
- Rounds 1-8 fixed 159 bugs (AbortSignal forwarding, prototype-pollution via \`in\`, symlink escapes, ReDoS, zip-bomb, IDOR/authz on tRPC routers, oauth ciphertext, job-slot try/finally, per-tool error isolation, token-usage tracking, path traversal, non-atomic read-modify-write CAS/lost-update, SSRF via raw fetch, hardcoded user id, WAV bounds, unit cross-dimension, broken cursor pagination, surrogate-pair splits, data-URI comma truncation, EPIPE crash, discover-hang, o-model system-prompt mangle, tool_choice mapping, domain-filter boundary, HTML entity astral decode). Do NOT re-report those patterns where already fixed. Report NEW distinct defects.${focusNote ? '\n\n' + focusNote : ''}`

// Round 9 mixes the last genuinely-unexamined files with a RE-SWEEP of the
// highest-complexity files already touched in rounds 1-8 — both to check the
// applied fixes didn't introduce new defects and to gauge convergence (a clean
// re-sweep is evidence we're approaching "dry").
const FINDERS = [
  // Unexamined / lightly-examined files
  { key: 'runtime-small-providers', lens: 'correctness, error-handling (cassette, scripted, fake, cohere, voyage, jina, defaults, audio-mime helpers)', files: ['packages/runtime/src/providers/cassette-provider.ts', 'packages/runtime/src/providers/scripted-provider.ts', 'packages/runtime/src/providers/audio-mime.ts', 'packages/runtime/src/providers/defaults.ts', 'packages/runtime/src/providers/provider-request-log.ts'] },
  { key: 'runtime-python-infra', lens: 'races, resource-leak, correctness (python-bridge-factory, python-worker-stderr, provider-session, context-packer)', files: ['packages/runtime/src/python-bridge-factory.ts', 'packages/runtime/src/python-worker-stderr.ts', 'packages/runtime/src/providers/provider-session.ts', 'packages/runtime/src/context-packer.ts'] },
  { key: 'agents-misc-tools', lens: 'correctness, security (create-task, control, finish-step/finish-graph, subtask-fields, image-injection, view-image, calculator, binary-output)', files: ['packages/agents/src/tools/create-task-tool.ts', 'packages/agents/src/tools/finish-step-tool.ts', 'packages/agents/src/tools/subtask-fields.ts', 'packages/agents/src/tools/binary-output.ts', 'packages/agents/src/output-format.ts'] },
  { key: 'agents-graph-builder', lens: 'correctness, races (graph-builder graph mutation, constants, types, agent-workflow-runner)', files: ['packages/agents/src/graph-builder.ts', 'packages/agents/src/agent-workflow-runner.ts', 'packages/agents/src/constants.ts'] },
  // Re-sweep: highest-complexity already-touched files
  { key: 'resweep-context', lens: 'races, correctness, resource-leak, security — RE-SWEEP the ProcessingContext (asset handling, memory, model interfaces, storage URIs)', files: ['packages/runtime/src/context.ts'] },
  { key: 'resweep-ws-runner', lens: 'races (job/chat lifecycle, seq cancellation), resource-leak — RE-SWEEP unified-websocket-runner after the round-7 stop/SSRF fixes', files: ['packages/websocket/src/unified-websocket-runner.ts'] },
  { key: 'resweep-base-provider', lens: 'correctness, error-handling, security (uri resolution, tool loop, usage) — RE-SWEEP base-provider', files: ['packages/runtime/src/providers/base-provider.ts'] },
  { key: 'resweep-openai-anthropic', lens: 'correctness, error-handling — RE-SWEEP openai + anthropic providers (streaming, tools, thinking, system messages)', files: ['packages/runtime/src/providers/openai-provider.ts', 'packages/runtime/src/providers/anthropic-provider.ts', 'packages/runtime/src/providers/openai-compat-provider.ts'] },
  { key: 'resweep-step-executor', lens: 'races, correctness (step/tool-call loop, result capture, error paths) — RE-SWEEP step-executor + task-executor', files: ['packages/agents/src/step-executor.ts', 'packages/agents/src/task-executor.ts'] },
  { key: 'resweep-actor-kernel', lens: 'races (actor messaging, input merge, lineage), correctness — RE-SWEEP actor + graph after the dynamic_properties fix', files: ['packages/kernel/src/actor.ts', 'packages/kernel/src/graph.ts'] },
  { key: 'resweep-timeline-image-models', lens: 'race-condition, correctness — RE-SWEEP timeline-sequence + image-document CAS mutators added in round 5', files: ['packages/models/src/timeline-sequence.ts', 'packages/models/src/image-document.ts'] },
  { key: 'resweep-storage-http', lens: 'security (path, range, authz), resource-leak — RE-SWEEP storage-api + http-api', files: ['packages/websocket/src/storage-api.ts', 'packages/websocket/src/http-api.ts'] },
]

phase('Find')
const verdictKey = (v) => v && v.refuted === false

// The re-sweep of the highest-complexity files runs on Fable (per request):
// dense, already-hardened files where a fresh model lens is most valuable.
const isHighComplexity = (finder) => finder.key.startsWith('resweep-')

const results = await pipeline(
  FINDERS,
  (finder) =>
    agent(
      `${PREAMBLE}\n\nYour lens: ${finder.lens}\nYour files (read all):\n${finder.files.map((f) => '- ' + f).join('\n')}\n\nHunt for bugs. Return structured findings.`,
      {
        label: `find:${finder.key}`,
        phase: 'Find',
        schema: FINDING_SCHEMA,
        ...(isHighComplexity(finder) ? { model: 'fable' } : {}),
      },
    ),
  (findResult, finder) => {
    const findings = (findResult && findResult.findings) || []
    if (!findings.length) return []
    const verifyModel = isHighComplexity(finder) ? { model: 'fable' } : {}
    return parallel(
      findings.map((f) => () =>
        parallel(
          [0, 1, 2].map((i) => () =>
            agent(
              `You are an adversarial skeptic (reviewer #${i + 1} of 3). A bug hunter claims the following is a REAL bug. DEFAULT to skepticism: try hard to REFUTE it. Read the actual code first.\n\nClaimed bug:\n- File: ${f.file}:${f.line}\n- Category: ${f.category}\n- Title: ${f.title}\n- Description: ${f.description}\n- Failure scenario: ${f.failureScenario}\n\nRead ${f.file} and related code. Set refuted=true if it's a false positive, intended/guarded behavior, unreachable, or the scenario doesn't hold. Set refuted=false ONLY if you independently confirm a genuine bug. Give code-grounded reasoning.`,
              { label: `verify:${finder.key}#${i}`, phase: 'Verify', schema: VERDICT_SCHEMA, ...verifyModel },
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
