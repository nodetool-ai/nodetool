export const meta = {
  name: 'kernel-runtime-bug-audit-r8',
  description: 'Round 8: find + adversarially verify bugs in files not swept in rounds 1-7',
  phases: [{ title: 'Find' }, { title: 'Verify' }],
}

const round = (args && args.round) || 8
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
- Rounds 1-7 fixed 140 bugs (AbortSignal forwarding, prototype-pollution via \`in\`, symlink escapes, ReDoS, zip-bomb, IDOR/authz on tRPC routers, oauth ciphertext, job-slot try/finally, per-tool error isolation, token-usage tracking, path traversal, non-atomic read-modify-write CAS/lost-update, SSRF via raw fetch, hardcoded user id, WAV bounds, unit cross-dimension, broken cursor pagination, surrogate-pair splits, data-URI comma truncation, EPIPE crash, discover-hang, o-model system-prompt mangle, tool_choice mapping, domain-filter boundary, HTML entity astral decode). Do NOT re-report those patterns where already fixed. Report NEW distinct defects.${focusNote ? '\n\n' + focusNote : ''}`

const FINDERS = [
  { key: 'ws-http-oauth-api', lens: 'security (authz/IDOR, SSRF, path), correctness, resource-leak (REST http-api + oauth-api handlers)', files: ['packages/websocket/src/http-api.ts', 'packages/websocket/src/oauth-api.ts'] },
  { key: 'ws-models-api', lens: 'security (path traversal, hardcoded user, SSRF on HF), correctness (models-api metadata/caching)', files: ['packages/websocket/src/models-api.ts'] },
  { key: 'ws-test-ui-screenshot', lens: 'security (browser/process lifecycle, path), resource-leak (test-ui server, screenshot server)', files: ['packages/websocket/src/test-ui-server.ts', 'packages/websocket/src/screenshot-server.ts'] },
  { key: 'ws-routers-misc', lens: 'security (authz/IDOR), correctness (extension, skills, users, settings, mcp-config routers)', files: ['packages/websocket/src/trpc/routers/extension.ts', 'packages/websocket/src/trpc/routers/skills.ts', 'packages/websocket/src/trpc/routers/users.ts', 'packages/websocket/src/trpc/routers/settings.ts', 'packages/websocket/src/trpc/routers/mcp-config.ts'] },
  { key: 'ws-lib-bundle', lens: 'security (zip traversal/bomb, asset paths), correctness (workflow-bundle import/export, resolve-media-urls)', files: ['packages/websocket/src/lib/workflow-bundle.ts', 'packages/websocket/src/resolve-media-urls.ts', 'packages/websocket/src/lib/asset-paths.ts'] },
  { key: 'runtime-telemetry-schema', lens: 'correctness, resource-leak (telemetry init/shutdown, trace exporters, tracing helpers, zod-schema conversion)', files: ['packages/runtime/src/telemetry.ts', 'packages/runtime/src/trace-exporters.ts', 'packages/runtime/src/tracing-helpers.ts', 'packages/runtime/src/zod-schema.ts'] },
  { key: 'runtime-provider-mgmt', lens: 'correctness, error-handling (provider registry/session/cache, python-provider, manifest-models, recommended-models)', files: ['packages/runtime/src/providers/python-provider.ts', 'packages/runtime/src/providers/manifest-models.ts', 'packages/runtime/src/providers/provider-registry.ts', 'packages/runtime/src/recommended-models.ts'] },
  { key: 'providers-compat-small', lens: 'correctness, error-handling (aki, atlascloud, gmi, llama, lmstudio, cerebras compat providers)', files: ['packages/runtime/src/providers/aki-provider.ts', 'packages/runtime/src/providers/atlascloud-provider.ts', 'packages/runtime/src/providers/gmi-provider.ts', 'packages/runtime/src/providers/llama-provider.ts', 'packages/runtime/src/providers/lmstudio-provider.ts'] },
  { key: 'providers-embed-3d', lens: 'security (SSRF), correctness (cohere, voyage, jina embeddings; rodin/meshy/reve 3d/media polling+download)', files: ['packages/runtime/src/providers/cohere-provider.ts', 'packages/runtime/src/providers/voyage-provider.ts', 'packages/runtime/src/providers/jina-provider.ts', 'packages/runtime/src/providers/rodin-provider.ts', 'packages/runtime/src/providers/reve-provider.ts'] },
  { key: 'runtime-comfy-python-graph', lens: 'races, resource-leak, correctness (comfy executor, python graph resolver, node executor, swappable bridge swap)', files: ['packages/runtime/src/comfy-executor.ts', 'packages/runtime/src/python-graph-resolver.ts', 'packages/runtime/src/python-node-executor.ts'] },
  { key: 'agents-graph-tools', lens: 'correctness, security (add-node/add-edge/finish-graph graph-mutation tools, create-plan/create-task, control-tool)', files: ['packages/agents/src/tools/add-node-tool.ts', 'packages/agents/src/tools/add-edge-tool.ts', 'packages/agents/src/tools/finish-graph-tool.ts', 'packages/agents/src/tools/create-plan-tool.ts', 'packages/agents/src/tools/control-tool.ts'] },
  { key: 'agents-node-model-tools', lens: 'correctness, security (local node info/search/list tools, find-model, model-tools, openai-tools, serp-tool-factory)', files: ['packages/agents/src/tools/local-get-node-info-tool.ts', 'packages/agents/src/tools/local-search-nodes-tool.ts', 'packages/agents/src/tools/find-model-tool.ts', 'packages/agents/src/tools/model-tools.ts', 'packages/agents/src/tools/serp-tool-factory.ts'] },
  { key: 'agents-memory-todo-workspace', lens: 'correctness, resource-leak, security (memory-tools, todo-tools, workspace-tools, asset-persist, binary-output)', files: ['packages/agents/src/tools/memory-tools.ts', 'packages/agents/src/tools/todo-tools.ts', 'packages/agents/src/tools/workspace-tools.ts', 'packages/agents/src/tools/asset-persist.ts', 'packages/agents/src/tools/binary-output.ts'] },
  { key: 'agents-core-runner', lens: 'races, correctness (agent-workflow-runner, output-format, graph-builder, security-monitor, constants)', files: ['packages/agents/src/agent-workflow-runner.ts', 'packages/agents/src/output-format.ts', 'packages/agents/src/graph-builder.ts', 'packages/agents/src/security-monitor.ts'] },
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
