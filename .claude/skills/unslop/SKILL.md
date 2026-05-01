---
name: unslop
description: Strip "AI slop" from code and prose in this repo — over-engineered abstractions, defensive checks on trusted paths, narrating comments, dead error handlers, redundant types, useEffect-for-derived-data, raw MUI imports, whole-store Zustand subscriptions, throat-clearing prose. Use when reviewing your own diff before commit, when the user says "unslop this", or when refactoring AI-generated code in `web/`, `electron/`, `mobile/`, or `packages/`. Triggers on TypeScript/React/Zustand/MUI/TanStack Query files. Tailored to NodeTool's stack (React 19, Zustand 4.5, MUI v7 + ui_primitives, TanStack Query v5, Vitest/Jest, Drizzle).
---

# Unslop

A pre-commit pass that removes patterns LLMs add reflexively but humans wouldn't write. Apply it to your own diff before claiming a task is done. The goal isn't to shorten the diff — it's to delete code whose absence would not be missed.

This skill complements (does not replace) [`AGENTS.md`](../../../AGENTS.md), [`CLAUDE.md`](../../../CLAUDE.md), and [`web/src/components/ui_primitives/STRATEGY.md`](../../../web/src/components/ui_primitives/STRATEGY.md). Those define the rules. This skill defines the patterns to actively hunt and remove.

## How to use

1. After making changes, run `git diff` and read every added line through the lenses below.
2. For each "slop" you find, delete or rewrite it. Don't leave a `// removed X` comment behind.
3. Re-run `npm run typecheck && npm run lint && npm run test` — unslopping must not break anything.
4. If you delete an abstraction, also delete its tests, types, and exports.

## Categories

| # | Category | Lens |
|---|----------|------|
| 1 | General code slop | "Would removing this confuse a future reader?" |
| 2 | Comment slop | "Does the WHY survive without the comment?" |
| 3 | Error-handling slop | "Can this error actually happen here?" |
| 4 | TypeScript slop | "Is this type narrowing/casting load-bearing?" |
| 5 | React 19 slop | "Is this hook earning its keep?" |
| 6 | Zustand slop | "Does this component re-render only when it should?" |
| 7 | MUI / styling slop | "Is this a primitive or a theme value?" |
| 8 | TanStack Query slop | "Why isn't this `useQuery`?" |
| 9 | Test slop | "Does this test catch a real regression?" |
| 10 | Prose slop | "Did a human write this sentence?" |

---

## 1. General code slop

**Hunt for:**

- **Speculative abstractions.** A `Strategy` interface with one implementation. A factory that returns one type. Three near-identical lines beat a premature helper.
- **Half-finished features** behind unused flags or `if (false)` branches. Delete them.
- **Re-exports of things nothing imports.** Run a search before claiming "this might be useful elsewhere".
- **Backwards-compatibility shims** for code paths you just changed. If callers are all in this repo, update the callers.
- **`_unused` parameter renames** for vars that could simply be removed.
- **`// TODO` for issues you could fix in this PR**, or worse, `// removed X — see commit Y`.

**Bad:**
```ts
function getNodeLabel(node: Node, _opts?: LabelOptions): string {
  // TODO: support i18n later
  return node.label ?? node.id;
}
```

**Good:**
```ts
function getNodeLabel(node: Node): string {
  return node.label ?? node.id;
}
```

---

## 2. Comment slop

Default to **no comments**. Only write one when the WHY is non-obvious — a hidden constraint, a workaround for a specific bug, a subtle invariant.

**Delete on sight:**

- Comments that restate the next line: `// increment counter`, `// loop over nodes`, `// return the result`.
- File or function "summary" docstrings that name-rephrase the identifier (`/** Get node label. Returns the node's label. */`).
- "Added by" / "fixes #123" / "used by FooComponent" annotations — that belongs in the commit message and PR description, not the source.
- Multi-line block comments above functions in this codebase. One short line max.
- Section banners like `// ============ HELPERS ============`.

**Bad:**
```ts
/**
 * Adds a node to the workflow.
 * @param node - The node to add.
 * @returns void
 */
// Used by NodeEditor.tsx (added in PR #2790)
function addNode(node: Node): void {
  this.nodes.push(node); // push the node
}
```

**Good:**
```ts
function addNode(node: Node): void {
  this.nodes.push(node);
}
```

---

## 3. Error-handling slop

Trust internal code. Validate at boundaries (user input, network, file system, IPC, child processes) — not between functions inside the same package.

**Hunt for:**

- `try/catch` that re-throws with a slightly different message (or worse, swallows silently with no comment).
- Defensive `if (!x) return` for values that the type system already guarantees are present.
- "Just in case" `?.` on values that aren't optional in the type.
- `try { ... } catch { return null }` followed by callers that just check for null — propagate the error.
- Custom `Error` subclasses with no extra fields and no distinct `catch` handler anywhere.

NodeTool rule: throw `Error` objects, not strings; comment **intentionally** empty catch blocks (the comment is the WHY).

**Bad:**
```ts
function getNode(id: string): Node | null {
  try {
    const node = nodeStore.get(id);
    if (!node) {
      return null;
    }
    return node;
  } catch (e) {
    console.error("Failed to get node:", e);
    return null;
  }
}
```

**Good:**
```ts
function getNode(id: string): Node | undefined {
  return nodeStore.get(id);
}
```

---

## 4. TypeScript slop

NodeTool runs strict mode. Lean on it.

**Hunt for:**

- `any`, `as any`, `as unknown as Foo`. If you needed it, the upstream type is wrong — fix that instead.
- Explicit return-type annotations that exactly match what TypeScript would infer (`(): string => "x"`).
- `Foo | undefined | null` when callers always pass one or the other.
- Type guards for variants the discriminated union already covers.
- Re-declared types that already live in `@nodetool-ai/protocol` or the generated `web/src/api.ts`.
- `interface FooProps {}` for a component with one inline-typed prop.
- `// @ts-ignore` / `// @ts-expect-error` without a one-line explanation of the actual reason (and a link to the bug if external).

**Bad:**
```ts
const handleClick = (e: any): void => {
  if (e && e.target) {
    onSelect(e.target.value as string);
  }
};
```

**Good:**
```ts
const handleClick = (e: ChangeEvent<HTMLInputElement>) => {
  onSelect(e.target.value);
};
```

---

## 5. React 19 slop

This repo uses **React 19**. Many older idioms are now slop.

**Hunt for:**

- **`useEffect` to derive state from props.** Compute it during render. `useMemo` only if the computation is genuinely expensive or referential stability matters.
- **`useEffect` to sync to a parent prop** — lift state up or use a key.
- **`useCallback` / `useMemo` "just in case"** when the value isn't passed to a memoized child or used as a hook dep.
- **`React.memo` on every component.** Only when profiling shows wasted renders on stable props.
- **`forwardRef`** — React 19 passes `ref` as a normal prop. Drop the wrapper.
- **`useState` for values derived from one prop** — just use the prop.
- **Inline arrow handlers passed to a `React.memo`'d child** — wrap with `useCallback` or stop memoizing the child.
- **Empty `useEffect(() => {}, [])`** or effects whose only job is `setX(props.x)`.

**Bad:**
```tsx
const NodeBadge = forwardRef<HTMLDivElement, Props>(({ node }, ref) => {
  const [label, setLabel] = useState("");
  useEffect(() => {
    setLabel(node.label.toUpperCase());
  }, [node.label]);
  const handleClick = useCallback(() => onSelect(node.id), [node.id]);
  return <div ref={ref} onClick={handleClick}>{label}</div>;
});
```

**Good:**
```tsx
function NodeBadge({ node, ref, onSelect }: Props) {
  return (
    <div ref={ref} onClick={() => onSelect(node.id)}>
      {node.label.toUpperCase()}
    </div>
  );
}
```

---

## 6. Zustand slop

NodeTool uses Zustand 4.5.7 with `shallow` equality. The rules in [`web/src/stores/AGENTS.md`](../../../web/src/stores/AGENTS.md) are not optional.

**Hunt for:**

- `const store = useFooStore()` (whole-store subscription) — replace with a selector.
- Multi-key selections that return a new object every render but **omit** `shallow` — every render re-runs subscribers.
- `useFooStore.getState().x` inside render bodies (only acceptable inside event handlers / effects).
- New `WebSocket(...)` instances anywhere in the web app — use `GlobalWebSocketManager`.
- Components subscribing to a slice and then doing more filtering in render — push the filter into the selector.
- A new store for state that belongs on an existing single-domain store.

**Bad:**
```tsx
const { nodes, edges, selectedId } = useNodeStore();
const selected = nodes.find(n => n.id === selectedId);
```

**Good:**
```tsx
const selected = useNodeStore(
  state => state.nodes.find(n => n.id === state.selectedId)
);
```

---

## 7. MUI / styling slop

NodeTool uses MUI v7 **wrapped by `web/src/components/ui_primitives/`**. Raw MUI imports are slop in component files.

**Hunt for:**

- `import { Typography, Button, IconButton, Tooltip, CircularProgress, Chip, Dialog, Alert, Divider, Paper, Skeleton, Tabs, Drawer, Breadcrumbs, Select, Switch, TextField } from "@mui/material"` outside `ui_primitives/` and `editor_ui/`. Use the primitives.
- Inline `sx={{ display: "flex", flexDirection: "column" }}` — use `<FlexColumn>` / `<FlexRow>`.
- Hardcoded hex colors, pixel paddings, or font sizes — use theme values, `SPACING`, `GAP`, `PADDING`.
- `styled()` calls in component files — `styled()` only belongs inside `ui_primitives/`.
- New `<Typography variant="...">` — use `Text`, `Label`, or `Caption`.
- Reaching past primitives into MUI internals (e.g., `MuiButton-root` overrides) when a primitive prop already exists.

If no primitive fits, **add one** to `ui_primitives/` rather than importing raw MUI in your feature file. See [`STRATEGY.md`](../../../web/src/components/ui_primitives/STRATEGY.md).

**Bad:**
```tsx
import { Typography, CircularProgress } from "@mui/material";
<div style={{ display: "flex", padding: 16, color: "#888" }}>
  <CircularProgress size={20} />
  <Typography variant="body2">Loading…</Typography>
</div>
```

**Good:**
```tsx
import { FlexRow, LoadingSpinner, Text } from "@/components/ui_primitives";
<FlexRow sx={{ p: 2 }}>
  <LoadingSpinner size="sm" />
  <Text variant="body2" color="muted">Loading…</Text>
</FlexRow>
```

---

## 8. TanStack Query slop

Server state lives in `web/src/serverState/`. Anything fetched from the backend goes through TanStack Query v5.

**Hunt for:**

- `useEffect(() => { fetch(...) }, [])` for backend data — convert to `useQuery`.
- Flat string query keys (`["workflow"]`) — keys must be hierarchical: `["workflows", workflowId]`.
- Mutations that don't `invalidateQueries` for affected keys.
- `enabled: true` (default) on queries with conditional inputs — pass `enabled: !!id` instead of bailing inside `queryFn`.
- Manual loading/error state with `useState` next to a query — read `isPending` / `error` from the query.
- Mixing Zustand and TanStack Query for the same data (e.g., caching the workflow list in a Zustand store).

**Bad:**
```tsx
const [workflow, setWorkflow] = useState<Workflow | null>(null);
useEffect(() => {
  if (id) fetch(`/api/workflows/${id}`).then(r => r.json()).then(setWorkflow);
}, [id]);
```

**Good:**
```tsx
const { data: workflow } = useQuery({
  queryKey: ["workflows", id],
  queryFn: () => api.workflows.get(id),
  enabled: !!id,
});
```

---

## 9. Test slop

Tests must verify behavior. Tests that mirror the implementation rot the moment you refactor.

**Hunt for:**

- `getByTestId` when `getByRole` / `getByLabelText` / `getByText` would work.
- Snapshot tests of large components — they assert "the markup didn't change" and mostly just record bugs.
- Mocks of internal modules (mocking your own `utils/` is a smell). Mock at the network/IO boundary.
- `expect(true).toBe(true)` smoke tests, or tests that only assert "didn't throw".
- Tests describing implementation: `it("calls setNodes")`, `it("uses useEffect")`. Describe behavior: `it("highlights the selected node")`.
- `await new Promise(r => setTimeout(r, 1000))` — use `waitFor` / `findBy*`.
- Re-implementing the production logic inside the test fixture.

**Bad:**
```tsx
it("calls setNodes when add is clicked", () => {
  const setNodes = jest.fn();
  render(<NodeEditor setNodes={setNodes} />);
  fireEvent.click(screen.getByTestId("add-btn"));
  expect(setNodes).toHaveBeenCalled();
});
```

**Good:**
```tsx
it("adds a new node when the user clicks Add Node", async () => {
  render(<NodeEditor />);
  await userEvent.click(screen.getByRole("button", { name: /add node/i }));
  expect(await screen.findByRole("listitem", { name: /untitled/i })).toBeVisible();
});
```

---

## 10. Prose slop

Applies to commit messages, PR descriptions, README/CLAUDE.md/AGENTS.md edits, code comments, error messages, and chat-facing text.

**Banned openers and crutches** (delete or rewrite):

- `Here's the thing,` `Let me be clear,` `It turns out,` `Make no mistake,` `Worth noting that,` `In summary,`
- `Let that sink in,` `Full stop,` `That said,`
- `delve, leverage, navigate, robust, seamless, intuitive, vibrant, tapestry, landscape, testament, pivotal, deep dive, unleash`
- `Certainly! / Of course! / Absolutely!` as a reply opener
- "Not just X. Y." binary contrasts
- "X. Y. Z." formulaic three-beats when one would do
- Numbered lists padded to three items because three feels balanced

**Style checks:**

- Active voice. Name the actor: *"the workflow runner emits…"*, not *"a message is emitted…"*.
- Concrete verbs over hedges: *"this fails when X"* beats *"this might cause issues with X"*.
- One idea per sentence. Vary sentence length.
- For commit messages: imperative mood, why over what. The diff already shows what.

**Bad:**
> This PR delves into the node selection landscape and leverages a robust new approach to seamlessly handle the intuitive interaction. Worth noting that it lays the foundation for future enhancements.

**Good:**
> Fixes a race where rapid clicks could leave two nodes marked selected. The selection store now tracks a single id instead of a Set; multi-select moved to a separate store.

---

## Self-review checklist

Run through this before declaring a task done. Treat any "yes" as a slop sighting to fix.

- [ ] Did I add a comment that restates the code, names the PR, or describes a removed feature?
- [ ] Did I add a `try/catch` whose error path can't actually trigger here?
- [ ] Did I write `any`, `as any`, or `as unknown as` to silence the compiler?
- [ ] Did I add `useEffect` to compute a value from props/state I already have?
- [ ] Did I `useCallback`/`useMemo`/`React.memo` without a memoized consumer or measurable cost?
- [ ] Did I subscribe to a whole Zustand store (`const s = useFooStore()`) or skip `shallow` on a multi-key selector?
- [ ] Did I import a raw MUI component into a non-primitive file, or hardcode a color/spacing?
- [ ] Did I write a `useEffect`+`fetch` instead of `useQuery`?
- [ ] Does any new test assert implementation rather than user-visible behavior?
- [ ] Are there `// TODO`, `// removed`, `// added by`, or "useful elsewhere" leftovers?
- [ ] Could three near-identical lines have been left as-is instead of becoming a helper?
- [ ] Does my prose contain any banned openers or filler ("delve", "robust", "seamlessly", "Here's the thing")?
- [ ] After all this, do `typecheck`, `lint`, and `test` still pass?

If everything is "no", the diff is unslopped.

## Sources

Patterns synthesized from these community skills, adapted to NodeTool's stack:

- [theclaymethod/unslop](https://github.com/theclaymethod/unslop) — humanizing AI-generated prose
- [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) — banned phrases and structural red flags
- [jalaalrd/anti-ai-slop-writing](https://github.com/jalaalrd/anti-ai-slop-writing) — banned-word and banned-pattern catalog
- [anthropics/skills/frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) — anti-generic-aesthetic principles
- [vercel-labs/agent-skills/composition-patterns](https://github.com/vercel-labs/agent-skills) — composition over boolean-prop proliferation
- [vercel-labs/agent-skills/react-best-practices](https://github.com/vercel-labs/agent-skills) — React/Next performance rules
- [awesome-skills/code-review-skill](https://github.com/awesome-skills/code-review-skill) — React 19 / TypeScript review patterns
- NodeTool's own [`AGENTS.md`](../../../AGENTS.md), [`CLAUDE.md`](../../../CLAUDE.md), and [`STRATEGY.md`](../../../web/src/components/ui_primitives/STRATEGY.md)
