export const meta = {
  name: 'kernel-runtime-bug-audit-r6',
  description: 'Round 6: find + adversarially verify bugs in files not swept in rounds 1-5',
  phases: [{ title: 'Find' }, { title: 'Verify' }],
}

const round = (args && args.round) || 6
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
- Rounds 1-5 fixed 91 bugs (AbortSignal forwarding, prototype-pollution via \`in\`, symlink escapes, ReDoS, zip-bomb, IDOR/authz, oauth ciphertext, job-slot try/finally, per-tool error isolation, token-usage tracking, path traversal, non-atomic read-modify-write CAS/lost-update, SSRF via raw fetch, hardcoded user id, WAV bounds, unit cross-dimension). Do NOT re-report those patterns where already fixed. Report NEW distinct defects.${focusNote ? '\n\n' + focusNote : ''}`

const FINDERS = [
  { key: 'ws-assets-files-storage', lens: 'security (authz/IDOR, path traversal, content-type), resource-leak (asset/file/storage tRPC routers — user data boundaries)', files: ['packages/websocket/src/trpc/routers/assets.ts', 'packages/websocket/src/trpc/routers/files.ts', 'packages/websocket/src/trpc/routers/storage.ts'] },
  { key: 'ws-workspace-sandboxes', lens: 'security (path traversal, command injection, sandbox escape), resource-leak (workspace + sandboxes routers)', files: ['packages/websocket/src/trpc/routers/workspace.ts', 'packages/websocket/src/trpc/routers/sandboxes.ts'] },
  { key: 'ws-threads-messages-users', lens: 'security (authz/IDOR), correctness (thread/message/user tRPC routers)', files: ['packages/websocket/src/trpc/routers/threads.ts', 'packages/websocket/src/trpc/routers/messages.ts', 'packages/websocket/src/trpc/routers/users.ts'] },
  { key: 'ws-collections-packs-nodes', lens: 'correctness, security (collections, packs, nodes routers)', files: ['packages/websocket/src/trpc/routers/collections.ts', 'packages/websocket/src/trpc/routers/packs.ts', 'packages/websocket/src/trpc/routers/nodes.ts'] },
  { key: 'ws-jobs-worker-costs', lens: 'races, resource-leak, correctness (jobs, worker, costs routers)', files: ['packages/websocket/src/trpc/routers/jobs.ts', 'packages/websocket/src/trpc/routers/worker.ts', 'packages/websocket/src/trpc/routers/costs.ts'] },
  { key: 'kernel-actor-runner-inbox', lens: 'races (actor messaging), resource-leak, correctness (actor loop, runner, inbox message passing)', files: ['packages/kernel/src/actor.ts', 'packages/kernel/src/runner.ts', 'packages/kernel/src/inbox.ts'] },
  { key: 'runtime-node-exec-channel', lens: 'races, correctness (node execution, streaming variable channel, context packer)', files: ['packages/runtime/src/node-executor.ts', 'packages/runtime/src/variable-channel.ts', 'packages/runtime/src/context-packer.ts'] },
  { key: 'runtime-media-codec', lens: 'correctness, resource-leak, security (image codec, media-ref bytes, media generation decode)', files: ['packages/runtime/src/image-codec.ts', 'packages/runtime/src/media-ref-bytes.ts'] },
  { key: 'runtime-python-node-exec', lens: 'races, resource-leak, correctness (python node executor, stdio bridge, graph resolver)', files: ['packages/runtime/src/python-node-executor.ts', 'packages/runtime/src/python-stdio-bridge.ts', 'packages/runtime/src/python-graph-resolver.ts'] },
  { key: 'runtime-token-cost', lens: 'correctness (token counting, cost reconciliation, provider cache lifecycle)', files: ['packages/runtime/src/token-counter.ts', 'packages/runtime/src/cost-reconciler.ts', 'packages/runtime/src/provider-cache.ts'] },
  { key: 'providers-openai-compat2', lens: 'correctness, error-handling (streaming, tool loop, usage, abort) in mistral/xai/groq/deepseek/openrouter providers', files: ['packages/runtime/src/providers/mistral-provider.ts', 'packages/runtime/src/providers/xai-provider.ts', 'packages/runtime/src/providers/groq-provider.ts', 'packages/runtime/src/providers/openrouter-provider.ts'] },
  { key: 'providers-responses-cohere', lens: 'correctness, error-handling (OpenAI Responses API adapter, cohere, voyage, jina embeddings)', files: ['packages/runtime/src/providers/responses-api.ts', 'packages/runtime/src/providers/cohere-provider.ts', 'packages/runtime/src/providers/voyage-provider.ts', 'packages/runtime/src/providers/jina-provider.ts'] },
  { key: 'agents-net-tools', lens: 'security (SSRF, injection, credential leak), correctness (browser, http, google, email, search tools)', files: ['packages/agents/src/tools/browser-tools.ts', 'packages/agents/src/tools/http-tools.ts', 'packages/agents/src/tools/google-tools.ts', 'packages/agents/src/tools/email-tools.ts', 'packages/agents/src/tools/search-tools.ts'] },
  { key: 'agents-code-collection-tools', lens: 'security (code exec, injection), correctness (code, collection, asset, calculator tools)', files: ['packages/agents/src/tools/code-tools.ts', 'packages/agents/src/tools/collection-tools.ts', 'packages/agents/src/tools/asset-tools.ts', 'packages/agents/src/tools/calculator-tool.ts'] },
  { key: 'agents-graph-security', lens: 'correctness, security (graph builder, security monitor, output format, agent workflow runner)', files: ['packages/agents/src/graph-builder.ts', 'packages/agents/src/security-monitor.ts', 'packages/agents/src/output-format.ts', 'packages/agents/src/agent-workflow-runner.ts'] },
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
