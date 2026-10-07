/**
 * PackageManager — the unified "install everything here" surface, as a two-pane
 * workspace.
 *
 * The left {@link PackageRail} picks one of four lists: Included, Python
 * packs, Third-party and Software. The right pane shows that list with one
 * search box and one status filter. Search and filter stay set when the user
 * picks another list. Data and derivation live in {@link usePackageManager}. Rendered
 * full-screen by {@link PackagesPage} (title/back live in the page hero).
 */
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent
} from "react";
import { useTheme } from "@mui/material/styles";

import { useGlobalCombo } from "../../stores/KeyPressedStore";

import {
  AlertBanner,
  Box,
  Chip,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  LabeledSwitch,
  SearchInput,
  Text,
  ToggleGroup,
  ToggleOption,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";
import PackageRail from "./PackageRail";
import PackageRow from "./PackageRow";
import ConsolePanel from "./ConsolePanel";
import PackagesMenu from "../menus/PackagesMenu";
import {
  PM_CATEGORIES,
  usePackageManager,
  type PMCategory,
  type PMFilter,
  type PMRow
} from "./usePackageManager";

/** Persist the active list so reopening the Package Manager lands where the
 *  user left off. */
const STORAGE_KEY = "nodetool.packageManager.location";

const isCategory = (value: unknown): value is PMCategory =>
  PM_CATEGORIES.includes(value as PMCategory);

const loadCategory = (): PMCategory => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return "included";
    const parsed = JSON.parse(raw) as { tab?: string; cat?: string };
    if (isCategory(parsed.cat)) return parsed.cat;
    // Older saves held a Software tab with runtime groups as categories.
    if (parsed.tab === "software") return "runtimes";
  } catch {
    // Corrupt/blocked storage — fall back to the default landing spot.
  }
  return "included";
};

const saveCategory = (cat: PMCategory) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cat }));
  } catch {
    // Storage unavailable (private mode / quota) — persistence is optional.
  }
};

/**
 * Soft, borderless status badges — a faint tint of the status color with
 * matching text, quieter than an outlined pill (esp. the ubiquitous
 * "Installed"). "Always on" / "Not installed" stay neutral.
 */
const BadgeChip = ({ badge }: { badge: PMRow["badge"] }) => {
  const theme = useTheme();
  if (!badge) return null;
  const styles: Record<
    Exclude<PMRow["badge"], null>,
    { label: string; bg: string; fg: string }
  > = {
    alwaysOn: {
      label: "Always on",
      bg: theme.vars.palette.action.selected,
      fg: theme.vars.palette.text.secondary
    },
    installed: {
      label: "Installed",
      bg: `rgba(${theme.vars.palette.success.mainChannel} / 0.14)`,
      fg: theme.vars.palette.success.main
    },
    update: {
      label: "Update available",
      bg: `rgba(${theme.vars.palette.warning.mainChannel} / 0.16)`,
      fg: theme.vars.palette.warning.main
    },
    notInstalled: {
      label: "Not installed",
      bg: theme.vars.palette.action.hover,
      fg: theme.vars.palette.text.secondary
    }
  };
  const s = styles[badge];
  return (
    <Chip
      label={s.label}
      compact
      variant="filled"
      sx={{ backgroundColor: s.bg, color: s.fg, fontWeight: 500 }}
    />
  );
};

const RowActions = ({ row }: { row: PMRow }) => {
  if (row.toggle) {
    return (
      <LabeledSwitch
        label={row.toggle.label}
        checked={row.toggle.enabled}
        disabled={row.toggle.disabled}
        onChange={row.toggle.onChange}
      />
    );
  }
  if (!row.buttons) return null;
  const { install, update, uninstall, busy, onInstall, onUpdate, onUninstall } =
    row.buttons;
  return (
    <>
      {update && (
        <EditorButton
          variant="contained"
          density="compact"
          disabled={busy}
          onClick={onUpdate}
        >
          {busy ? "Working…" : "Update"}
        </EditorButton>
      )}
      {install && (
        <EditorButton
          variant="contained"
          density="compact"
          disabled={busy}
          onClick={onInstall}
        >
          {busy ? "Installing…" : "Install"}
        </EditorButton>
      )}
      {uninstall && (
        <EditorButton
          variant="outlined"
          density="compact"
          disabled={busy}
          onClick={onUninstall}
        >
          {busy ? "Working…" : "Uninstall"}
        </EditorButton>
      )}
    </>
  );
};

const PackageRowItem = memo(function PackageRowItem({ row }: { row: PMRow }) {
  return (
    <PackageRow
      name={row.name}
      description={row.desc}
      meta={
        <>
          <BadgeChip badge={row.badge} />
          {row.version && (
            <Text size="small" color="secondary" family="secondary">
              {row.version}
            </Text>
          )}
        </>
      }
      actions={<RowActions row={row} />}
    />
  );
});

function PackageManager() {
  const [cat, setCat] = useState(loadCategory);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<PMFilter>("all");
  const searchRef = useRef<HTMLInputElement>(null);

  const model = usePackageManager({ cat, q, filter });

  useEffect(() => {
    saveCategory(cat);
  }, [cat]);

  const handleCat = useCallback((id: string) => {
    if (isCategory(id)) setCat(id);
  }, []);

  const handleFilter = useCallback(
    (_event: MouseEvent<HTMLElement>, value: PMFilter | null) => {
      if (value) setFilter(value);
    },
    []
  );

  const clearSearchAndFilter = useCallback(() => {
    setQ("");
    setFilter("all");
  }, []);

  const showSearch = !model.isThirdParty && !model.notice;
  const showFilter = showSearch && model.filters.length > 0;
  const narrowed = q.trim() !== "" || filter !== "all";

  // "/" focuses the search box. The store owns the gate — it skips while
  // anything editable is focused and when the box cannot take focus (e.g. this
  // Package Manager tab is open but inert in the background).
  useGlobalCombo("/", () => searchRef.current?.focus(), {
    active: showSearch,
    target: () => searchRef.current
  });

  return (
    <Box
      sx={{
        display: "flex",
        // The rail stacks above the list on a phone (see PackageRail).
        flexDirection: { xs: "column", sm: "row" },
        width: "100%",
        height: "100%",
        minHeight: 0
      }}
    >
      <PackageRail
        categories={model.categories}
        activeCat={cat}
        onCat={handleCat}
      />

      <FlexColumn sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <FlexColumn
          gap={0}
          sx={{
            flexShrink: 0,
            pt: SPACING.lg,
            px: { xs: SPACING.md, sm: SPACING.xl }
          }}
        >
          {model.isSoftware && (
            <FlexRow
              gap={SPACING.md}
              align="center"
              sx={(theme) => ({
                mb: SPACING.lg,
                px: SPACING.md,
                py: SPACING.sm,
                borderRadius: BORDER_RADIUS.xl,
                border: `1px solid ${theme.vars.palette.divider}`,
                backgroundColor: theme.vars.palette.background.paper
              })}
            >
              <Text
                size="small"
                color="secondary"
                weight={600}
                sx={{ textTransform: "uppercase", letterSpacing: "0.09em" }}
              >
                Install location
              </Text>
              <Text size="small" family="secondary" truncate>
                {model.installLocation || "Default conda environment"}
              </Text>
              <Box sx={{ ml: "auto" }}>
                <EditorButton
                  variant="outlined"
                  density="compact"
                  onClick={model.onChangeLocation}
                >
                  Change…
                </EditorButton>
              </Box>
            </FlexRow>
          )}

          <FlexRow gap={2} align="flex-start">
            <FlexColumn gap={SPACING.xs} sx={{ flex: 1, minWidth: 0 }}>
              <FlexRow gap={SPACING.sm} align="center">
                <Text size="big" weight={600}>
                  {model.title}
                </Text>
                <Box
                  sx={(theme) => ({
                    fontFamily: theme.fontFamily2,
                    fontSize: "var(--fontSizeSmaller)",
                    fontWeight: 500,
                    color: theme.vars.palette.text.secondary,
                    backgroundColor: theme.vars.palette.action.selected,
                    py: SPACING.micro,
                    px: SPACING.md,
                    borderRadius: BORDER_RADIUS.md
                  })}
                >
                  {model.count}
                </Box>
              </FlexRow>
              <Text size="small" color="secondary" sx={{ maxWidth: "72ch" }}>
                {model.subtitle}
              </Text>
            </FlexColumn>
            {showSearch && (
              <FlexRow gap={1.5} align="center" sx={{ flexShrink: 0 }}>
                {model.bulkUpdate && (
                  <EditorButton
                    variant="contained"
                    density="compact"
                    disabled={model.bulkUpdate.busy}
                    onClick={model.bulkUpdate.onUpdateAll}
                  >
                    {model.bulkUpdate.busy
                      ? "Updating…"
                      : `Update all (${model.bulkUpdate.count})`}
                  </EditorButton>
                )}
                <Box sx={{ width: { xs: "100%", sm: 250 } }}>
                  <SearchInput
                    ref={searchRef}
                    value={q}
                    onChange={setQ}
                    placeholder="Search…  (press /)"
                    showClear
                  />
                </Box>
              </FlexRow>
            )}
          </FlexRow>

          {showFilter && (
            <Box sx={{ mt: SPACING.md, maxWidth: "100%", overflowX: "auto" }}>
              <ToggleGroup
                value={filter}
                exclusive
                segmented
                onChange={handleFilter}
                aria-label="Status filter"
              >
                {model.filters.map((option) => (
                  <ToggleOption key={option.id} value={option.id}>
                    {option.label}
                    <Box
                      component="span"
                      sx={{ ml: SPACING.sm, color: "text.secondary" }}
                    >
                      {option.count}
                    </Box>
                  </ToggleOption>
                ))}
              </ToggleGroup>
            </Box>
          )}

          <Box
            sx={(theme) => ({
              height: "1px",
              backgroundColor: theme.vars.palette.divider,
              mt: 2.5
            })}
          />
        </FlexColumn>

        <FlexColumn
          gap={2}
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            pt: 2,
            px: SPACING.xl,
            pb: 4
          }}
        >
          {model.error && (
            <AlertBanner severity="error" compact>
              {model.error}
            </AlertBanner>
          )}

          {model.notice ? (
            <AlertBanner severity="info">{model.notice}</AlertBanner>
          ) : model.isThirdParty ? (
            <PackagesMenu />
          ) : model.rows.length > 0 ? (
            <FlexColumn gap={SPACING.md}>
              {model.rows.map((row, index) => (
                <Fragment key={row.key}>
                  {row.group && row.group !== model.rows[index - 1]?.group && (
                    <Text
                      size="small"
                      color="secondary"
                      weight={600}
                      sx={{
                        textTransform: "uppercase",
                        letterSpacing: "0.09em",
                        pt: index === 0 ? 0 : SPACING.md
                      }}
                    >
                      {row.group}
                    </Text>
                  )}
                  <PackageRowItem row={row} />
                </Fragment>
              ))}
            </FlexColumn>
          ) : (
            <EmptyState
              variant={narrowed ? "no-results" : "empty"}
              title={narrowed ? "Nothing matches" : "Nothing here yet"}
              description={
                narrowed
                  ? "No package in this list matches the search and the status filter."
                  : "This list has no packages."
              }
              actionText={narrowed ? "Show all" : undefined}
              onAction={narrowed ? clearSearchAndFilter : undefined}
            />
          )}

          {model.console && (
            <ConsolePanel
              lines={model.console.lines}
              onClear={model.console.onClear}
              busy={model.console.busy}
            />
          )}
        </FlexColumn>
      </FlexColumn>
    </Box>
  );
}

export default memo(PackageManager);
