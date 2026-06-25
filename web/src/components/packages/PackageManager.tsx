/**
 * PackageManager — the unified "install everything here" surface, as a two-pane
 * workspace.
 *
 * The left {@link PackageRail} switches between Software (system runtimes) and
 * Node Packs (Included / Registry / Third-party) and navigates categories; the
 * right pane shows the focused, searchable, status-filtered list for the active
 * category. Data and derivation live in {@link usePackageManager}. Rendered
 * full-screen by {@link PackagesPage} (title/back live in the page hero).
 */
import { memo, useCallback, useState } from "react";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";

import {
  AlertBanner,
  Box,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  LabeledSwitch,
  SearchInput,
  Text,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";
import PackageRail from "./PackageRail";
import PackageRow from "./PackageRow";
import ConsolePanel from "./ConsolePanel";
import PackagesMenu from "../menus/PackagesMenu";
import {
  usePackageManager,
  type PMTab,
  type PMRow
} from "./usePackageManager";

const DEFAULT_CAT: Record<PMTab, string> = {
  software: "all",
  packs: "included"
};

const BadgeChip = ({ badge }: { badge: PMRow["badge"] }) => {
  switch (badge) {
    case "alwaysOn":
      return <Chip label="Always on" compact />;
    case "installed":
      return <Chip label="Installed" color="success" compact />;
    case "update":
      return <Chip label="Update available" color="warning" compact />;
    case "notInstalled":
      return <Chip label="Not installed" compact />;
    default:
      return null;
  }
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
  const [tab, setTab] = useState<PMTab>("packs");
  const [cat, setCat] = useState<string>("included");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");

  const model = usePackageManager({ tab, cat, q, filter });

  const handleTab = useCallback((next: PMTab) => {
    setTab(next);
    setCat(DEFAULT_CAT[next]);
    setFilter("all");
    setQ("");
  }, []);

  const handleCat = useCallback((id: string) => {
    setCat(id);
    setFilter("all");
  }, []);

  const showSearch = !model.isThirdParty && !model.notice;
  const showChips = showSearch && model.chips.length > 0;

  return (
    <FlexRow sx={{ width: "100%", height: "100%", minHeight: 0 }}>
      <PackageRail
        tab={tab}
        onTab={handleTab}
        categories={model.categories}
        activeCat={cat}
        onCat={handleCat}
      />

      <FlexColumn sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        {/* Right header */}
        <FlexColumn gap={0} sx={{ flexShrink: 0, pt: 2.75, px: 3.75 }}>
          {model.isSoftware && (
            <FlexRow
              gap={1.75}
              align="center"
              sx={(theme) => ({
                mb: 2.5,
                px: 1.875,
                py: 1.375,
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
            <FlexColumn gap={0.75} sx={{ flex: 1, minWidth: 0 }}>
              <FlexRow gap={1.25} align="center">
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
              <Box sx={{ width: 250, flexShrink: 0 }}>
                <SearchInput
                  value={q}
                  onChange={setQ}
                  placeholder="Search…"
                  showClear
                />
              </Box>
            )}
          </FlexRow>

          {showChips && (
            <FlexRow gap={1} sx={{ flexWrap: "wrap", mt: 2.25 }}>
              {model.chips.map((chip) => (
                <Chip
                  key={chip.id}
                  label={`${chip.label}  ${chip.count}`}
                  active={filter === chip.id}
                  clickable
                  onClick={() => setFilter(chip.id)}
                  compact
                />
              ))}
            </FlexRow>
          )}

          <Box
            sx={(theme) => ({
              height: "1px",
              backgroundColor: theme.vars.palette.divider,
              mt: 2.5
            })}
          />
        </FlexColumn>

        {/* Right scroll */}
        <FlexColumn
          gap={2}
          sx={{ flex: 1, minHeight: 0, overflowY: "auto", pt: 2, px: 3.75, pb: 4 }}
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
            <FlexColumn gap={1.25}>
              {model.rows.map((row) => (
                <PackageRowItem key={row.key} row={row} />
              ))}
            </FlexColumn>
          ) : (
            <FlexColumn
              align="center"
              justify="center"
              gap={1}
              sx={{ textAlign: "center", py: 9 }}
            >
              <Box
                sx={(theme) => ({
                  width: 46,
                  height: 46,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: BORDER_RADIUS.xl,
                  border: `1px solid ${theme.vars.palette.divider}`,
                  color: theme.vars.palette.text.secondary,
                  mb: 0.5
                })}
              >
                <SearchOutlinedIcon sx={{ fontSize: 20 }} />
              </Box>
              <Text size="normal" weight={600} color="secondary">
                No packs match
              </Text>
              <Text size="small" color="secondary" sx={{ maxWidth: "40ch" }}>
                Try a different search term or switch the status filter back to
                All.
              </Text>
            </FlexColumn>
          )}

          {model.console && (
            <ConsolePanel
              lines={model.console.lines}
              onClear={model.console.onClear}
            />
          )}
        </FlexColumn>
      </FlexColumn>
    </FlexRow>
  );
}

export default memo(PackageManager);
