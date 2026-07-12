export const meta = {
  name: 'kernel-runtime-bug-audit-r7',
  description: 'Round 7: find + adversarially verify bugs in files not swept in rounds 1-6',
  phases: [{ title: 'Find' }, { title: 'Verify' }],
}

const round = (args && args.round) || 7
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
- Rounds 1-6 fixed 115 bugs (AbortSignal forwarding, prototype-pollution via \`in\`, symlink escapes, ReDoS, zip-bomb, IDOR/authz on tRPC routers, oauth ciphertext, job-slot try/finally, per-tool error isolation, token-usage tracking, path traversal, non-atomic read-modify-write CAS/lost-update, SSRF via raw fetch, hardcoded user id, WAV bounds, unit cross-dimension, broken cursor pagination, surrogate-pair splits, data-URI comma truncation, EPIPE crash, discover-hang, o-model system-prompt mangle, tool_choice mapping, domain-filter boundary, HTML entity astral decode). Do NOT re-report those patterns where already fixed. Report NEW distinct defects.${focusNote ? '\n\n' + focusNote : ''}`

const FINDERS = [
  { key: 'ws-runner-core', lens: 'races (job/actor lifecycle, slot accounting), resource-leak (streams, listeners), correctness in the main websocket runner', files: ['packages/websocket/src/unified-websocket-runner.ts'] },
  { key: 'ws-agent-runtime', lens: 'correctness, resource-leak, races (chat agent runtime, pi-agent, llm-agent glue)', files: ['packages/websocket/src/agent/agent-runtime.ts', 'packages/websocket/src/agent/pi-agent.ts'] },
  { key: 'ws-storage-api-http', lens: 'security (path traversal, authz, content-type sniffing), resource-leak (REST storage + http-api binary handlers)', files: ['packages/websocket/src/storage-api.ts', 'packages/websocket/src/lib/asset-paths.ts', 'packages/websocket/src/lib/thumbnail.ts'] },
  { key: 'ws-mcp-screenshot', lens: 'security (SSRF, command/browser lifecycle), resource-leak (mcp server, screenshot server)', files: ['packages/websocket/src/mcp-server.ts', 'packages/websocket/src/screenshot-server.ts'] },
  { key: 'ws-settings-plugins', lens: 'correctness, security (settings registry, websocket plugin, pack snapshot)', files: ['packages/websocket/src/settings-registry.ts', 'packages/websocket/src/plugins/websocket.ts', 'packages/websocket/src/pack-snapshot.ts'] },
  { key: 'ws-files-collections-nodes', lens: 'security (authz/IDOR, path), correctness (files, collections, nodes routers)', files: ['packages/websocket/src/trpc/routers/files.ts', 'packages/websocket/src/trpc/routers/collections.ts', 'packages/websocket/src/trpc/routers/nodes.ts'] },
  { key: 'kernel-graph-io', lens: 'correctness (graph construction, edge ids, IO wiring), races (message routing)', files: ['packages/kernel/src/graph.ts', 'packages/kernel/src/graph-utils.ts', 'packages/kernel/src/edge-ids.ts', 'packages/kernel/src/io.ts'] },
  { key: 'runtime-image-codec-memory', lens: 'correctness, resource-leak, security (image codec decode, agent-memory store, recommended-models)', files: ['packages/runtime/src/image-codec.ts', 'packages/runtime/src/agent-memory.ts', 'packages/runtime/src/recommended-models.ts'] },
  { key: 'runtime-provider-infra', lens: 'correctness, resource-leak (provider registry/session/request-log, swappable/factory bridge lifecycle)', files: ['packages/runtime/src/providers/provider-registry.ts', 'packages/runtime/src/providers/provider-session.ts', 'packages/runtime/src/providers/provider-request-log.ts', 'packages/runtime/src/swappable-python-bridge.ts'] },
  { key: 'providers-media-gen', lens: 'security (SSRF on result URLs), error-handling (polling, download) in reve/rodin/topaz/meshy/evolink providers', files: ['packages/runtime/src/providers/reve-provider.ts', 'packages/runtime/src/providers/rodin-provider.ts', 'packages/runtime/src/providers/topaz-provider.ts', 'packages/runtime/src/providers/meshy-provider.ts', 'packages/runtime/src/providers/evolink-provider.ts'] },
  { key: 'providers-embed-audio', lens: 'correctness, error-handling (elevenlabs, cohere, voyage, jina, moonshot, deepseek providers)', files: ['packages/runtime/src/providers/elevenlabs-provider.ts', 'packages/runtime/src/providers/moonshot-provider.ts', 'packages/runtime/src/providers/deepseek-provider.ts', 'packages/runtime/src/providers/vllm-provider.ts'] },
  { key: 'agents-executors', lens: 'races, correctness (agent workflow runner, task planner internals, step/tool-call loops)', files: ['packages/agents/src/agent-workflow-runner.ts', 'packages/agents/src/tools/run-subtask-tool.ts', 'packages/agents/src/tools/tool-registry.ts', 'packages/agents/src/tools/tool-permissions.ts'] },
  { key: 'agents-code-image-tools', lens: 'security (code exec sandbox, path), correctness (js-code, image-generation, image-injection, view-image tools)', files: ['packages/agents/src/tools/js-code-tool.ts', 'packages/agents/src/tools/image-generation-tool.ts', 'packages/agents/src/tools/image-injection.ts', 'packages/agents/src/tools/view-image-tool.ts'] },
  { key: 'agents-ltm-collection-workspace', lens: 'correctness, resource-leak, security (ltm tools, collection tools, workspace tools, asset-persist)', files: ['packages/agents/src/tools/ltm-tools.ts', 'packages/agents/src/tools/collection-tools.ts', 'packages/agents/src/tools/workspace-tools.ts', 'packages/agents/src/tools/asset-persist.ts'] },
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
