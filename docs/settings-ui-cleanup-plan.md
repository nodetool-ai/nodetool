# Settings UI Cleanup Plan

Scope: the Settings page in `web/src/components/menus/` — `SettingsMenu.tsx`,
`APIKeysTab.tsx`, `RemoteSettingsMenu.tsx`, `settingsMenuStyles.ts`,
`sharedSettingsStyles.ts`, `SettingsSidebar.tsx`.

Goals:

1. Move the OpenAI and HuggingFace integrations (OAuth connect) from the
   Integrations tab into the API Keys tab.
2. Group settings into fewer, clearer sections on both tabs.
3. Fix spacing and layout: tokenized rhythm, one shared style source, a
   readable content column.

## Current state

- **API Keys tab** (`APIKeysTab.tsx`) is already the home for provider
  credentials: ~40 provider cards from `PROVIDER_META`, split into
  Connected / Recommended / Other, with a right sidebar (quick links, promo).
- **Integrations tab** renders `RemoteSettingsMenu`, which contains two
  misplaced sections — **HuggingFace Authentication** and **OpenAI
  Authentication** (OAuth connect buttons + token polling) — followed by the
  Search Provider picker and the generic registry-driven groups (vLLM, Ollama,
  LlamaCpp, LMStudio, TransformersJs, NodeSupabase, Observability, ZAI, KIE,
  Autosave leftovers), then MCP Servers, Browser Extension, and Folders.
- Secrets are already filtered out of the generic Integrations list
  (`is_secret` check), so keys live only on the API Keys tab. Only the two
  OAuth flows are in the wrong place.
- Styling is split across two overlapping files. `settingsMenuStyles.ts` and
  `sharedSettingsStyles.ts` both define `.settings-item`, `.settings-section`,
  `.description`, and input chrome with slightly different values. Both are
  full of hardcoded em values (`0.9em`, `1.5em`, `2.5em`), `borderRadius:
  ".3em"`, and `maxWidth: "34em !important"` — all violations of the
  `SPACING`/`BORDER_RADIUS` token rules in `docs/DESIGN.md`.

## Phase 1 — OpenAI and HF move to API Keys

The OAuth sections become part of the existing OpenAI and HuggingFace provider
cards instead of separate sections on another tab.

1. **Extract a hook.** Pull the duplicated polling/connect/disconnect logic
   out of `RemoteSettingsMenu.tsx` (lines ~222–523) into
   `web/src/hooks/useOAuthConnection.ts`:

   ```ts
   useOAuthConnection(provider: "openai" | "hf"): {
     isConnected: boolean;
     isLoading: boolean;
     connect: () => Promise<void>;
     disconnect: () => Promise<void>;   // openai only today; hf returns undefined
   }
   ```

   The two blocks are copy-paste twins (`/api/oauth/<provider>/tokens`,
   `/start`, `/disconnect`); one parameterized hook replaces both.

2. **Extend `ProviderMeta`** in `APIKeysTab.tsx` with
   `oauth?: "openai" | "hf"`. Set it on the OpenAI and HuggingFace entries.

3. **Extend `ProviderCard`.** When `meta.oauth` is set, the card gets a second
   action: primary `Connect` (API key dialog, unchanged) plus a
   `Sign in with <Provider>` text button driven by the hook. An
   OAuth-connected provider shows the same green "Connected" pill (label
   `Connected via OAuth`) and a `Disconnect` action where supported. The
   connect dialog for these two providers offers both paths: paste a key, or
   sign in.

4. **Delete from Integrations.** Remove the two OAuth sections from
   `RemoteSettingsMenu.tsx`, the `huggingface-oauth` sidebar item in
   `SettingsMenu.tsx` (`integrationsSidebarSections`), and the now-unused
   OAuth imports. Update `RemoteSettingsMenu.test.tsx`.

5. **Provider availability**: OAuth connect/disconnect must invalidate the
   same query keys the key-save path does (`secrets`, `PROVIDER_QUERY_KEYS`,
   `MODEL_QUERY_KEYS`) so model lists refresh — today the OAuth path skips
   this.

## Phase 2 — Group the API Keys tab by function

Connected / Recommended / Other buries 35+ providers in one undifferentiated
"Other" list. Replace `category: "recommended" | "other"` with a functional
`section`, keeping "Connected" floating on top:

| Section | Providers |
|---|---|
| Connected | any configured provider (unchanged) |
| Popular | OpenAI, Anthropic, Gemini, OpenRouter |
| Language models | Groq, Mistral, DeepSeek, xAI, Cerebras, Together, Kimi, Z.AI, MiniMax, HuggingFace |
| Media generation | FAL, Replicate, ElevenLabs, Topaz, AtlasCloud, Reve, Meshy, Rodin |
| Gateways & hubs | Evolink, GMI Cloud, AKI, Aime, Kie.ai |
| Web search | SerpAPI, Apify, Brave Search, DataForSEO (login + password as one card, see below) |
| Compute & local | RunPod, Vast.ai, llama.cpp |
| Services & advanced | Google Mail (user + app password), GitHub OAuth App (ID + secret), NodeSupabase, Traceloop, Server Auth Token |

Implementation details:

- Sections render in the order above; empty sections (after search
  filtering) don't render. `SectionTitle` with count stays.
- Collapse multi-field credentials into one card: DataForSEO
  (login/password), Google Mail (user/app password), GitHub OAuth App
  (ID/secret). The connect dialog for these shows two inputs; the card shows
  connected only when all parts are set. This cuts six confusing half-cards
  down to three.
- "Services & advanced" defaults to collapsed (a `CollapsibleSection` or a
  "Show advanced" toggle) — Server Auth Token and GitHub OAuth App are
  operator settings, not something most users should scan past.
- Search continues to match across all sections.

## Phase 3 — Regroup the Integrations tab

After Phase 1 the tab holds: Search Provider, registry groups, MCP, Browser
Extension, Folders, and (hosted only) the Nodetool API token. Impose a fixed
section order with explicit meta-groups instead of echoing raw registry group
names:

| Section | Contents |
|---|---|
| Local model servers | vLLM, Ollama, LlamaCpp (URL + context length), LMStudio, TransformersJs cache dir |
| Web search | Search Provider picker (existing `SearchProviderSection`) |
| Provider options | ZAI coding-plan toggle, KIE timeout |
| Observability | Traceloop settings |
| Data & storage | NodeSupabase, Folders |
| Servers (localhost only) | MCP Servers, Browser Extension |
| Nodetool API (hosted only) | API token copy card |

Implementation:

- Add a `GROUP_SECTIONS` map in `RemoteSettingsMenu.tsx` that assigns each
  registry group to one of the meta-sections above; unknown future groups fall
  into a trailing "Other" section so nothing silently disappears.
- `getDisplayedSettingGroups` returns the meta-sections so the sidebar mirrors
  the panel exactly (it already consumes this function).
- Hide the leftover registry `Autosave` group here too (it's already surfaced
  on the General tab) by adding it to `HIDDEN_SETTING_GROUPS`.
- Replace the single sticky "SAVE SETTINGS" button with save-on-blur per
  field (mutation already exists), or — smaller change — keep the sticky bar
  but only show it when there are unsaved edits (dirty tracking on
  `settingValues`). Recommended: the dirty-aware sticky bar first; per-field
  autosave as a follow-up.

## Phase 4 — Spacing and layout

1. **One style source.** Merge `sharedSettingsStyles.ts` into
   `settingsMenuStyles.ts` (or extract the genuinely shared parts into a
   third file both import). `.settings-item`, `.settings-section`,
   `.description`, and the input chrome must be defined once. Delete dead
   rules (`.show-hide-button { color: red }`, unused `h2`/`h3` variants).
2. **Tokens.** Replace hardcoded values with `SPACING`, `BORDER_RADIUS`,
   `MOTION`, and theme font sizes:
   - `borderRadius: ".3em"` / `"6px"` → `BORDER_RADIUS.sm`/`md`
   - row padding `0.9em 0` → `theme.spacing(SPACING.md, 0)` on the 4px grid
   - section gaps `1.5em` / `2.5em` → two named constants (e.g. section gap =
     `SPACING.xl`, heading top = `SPACING.xxl`) used everywhere
   - drop both `!important` max-width hacks; give inputs a single
     `maxWidth: "34em"` rule at one place
3. **Content column.** Cap `.settings-content` at a readable width
   (`max-width: 760px` for form tabs; the API Keys card list may stay wider,
   ~880px) and center it. Today rows stretch the full window on wide screens
   while descriptions cap at `60ch`, which looks ragged.
4. **Consistent section rhythm.** Every section = heading (divider above,
   except the first) + optional description + rows with identical vertical
   padding. The General tab already approximates this; Integrations inherits
   it once styles are merged.
5. **API Keys polish.**
   - Show `GetStartedBanner` only when no provider is connected; once one is
     connected it's noise above the fold.
   - Align the search input into the same content column as the cards.
   - Fix the stray indentation in `ProviderCard` (line ~547) and move
     hardcoded `48`/`28`/`18` icon sizes to constants.
6. **Mobile.** Verify the API Keys right sidebar and the tab layout below
   `sm`; the right sidebar should drop before the card layout breaks
   (hide below `md`, not just `sm`).

## Phase 5 — Wiring and verification

- Update `integrationsSidebarSections` and `generalSidebarSections` in
  `SettingsMenu.tsx` to match the new section ids; keep
  `settingGroupSlug` anchors stable where possible so deep links survive.
- Tests: extend `RemoteSettingsMenu.test.tsx` (OAuth gone, meta-groups
  render), add `useOAuthConnection` hook tests (poll → connected → notify),
  and a `ProviderCard` OAuth-variant test.
- Run `npm run typecheck && npm run lint && cd web && npm test`.
- Manual pass with `npm run dev`: both tabs, search on each tab, sidebar
  scroll-to-section, connect/disconnect OAuth (needs a configured OAuth
  backend), key add/delete, localhost vs hosted variants.

## Sequencing

Each phase is an independent PR-sized change, in order: 1 (move OAuth) →
2 (API Keys grouping) → 3 (Integrations grouping) → 4 (styles) → 5 runs with
each. Phase 4 touches everything, so it lands last to avoid rebase churn.
