import { useState } from "react";
import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import AddIcon from "@mui/icons-material/Add";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import HistoryIcon from "@mui/icons-material/History";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import { Box } from "../components/ui_primitives/Box";
import { BORDER_RADIUS } from "../components/ui_primitives/tokens";
import { Button } from "../components/ui_primitives/muiReexports";
import { Caption } from "../components/ui_primitives/Caption";
import { Chip } from "../components/ui_primitives/Chip";
import { CollapsibleSection } from "../components/ui_primitives/CollapsibleSection";
import { Divider } from "../components/ui_primitives/Divider";
import { EmptyState } from "../components/ui_primitives/EmptyState";
import { FieldDensityContext } from "../components/ui_primitives/fieldDensity";
import { FlexColumn } from "../components/ui_primitives/FlexColumn";
import { FlexRow } from "../components/ui_primitives/FlexRow";
import { InspectorFieldRow } from "../components/ui_primitives/InspectorFieldRow";
import { InspectorSelect } from "../components/ui_primitives/InspectorSelect";
import { InspectorToggleRow } from "../components/ui_primitives/InspectorToggleRow";
import { InspectorValueInput } from "../components/ui_primitives/InspectorValueInput";
import { LabeledSwitch } from "../components/ui_primitives/LabeledSwitch";
import { ListGroup, ListItemRow } from "../components/ui_primitives/ListGroup";
import { PanelHeader } from "../components/ui_primitives/PanelHeader";
import { SearchInput } from "../components/ui_primitives/SearchInput";
import { SectionHeader } from "../components/ui_primitives/SectionHeader";
import { SelectField } from "../components/ui_primitives/SelectField";
import { TabGroup } from "../components/ui_primitives/TabGroup";
import { Text } from "../components/ui_primitives/Text";
import { TextInput } from "../components/ui_primitives/TextInput";
import { ToolbarIconButton } from "../components/ui_primitives/ToolbarIconButton";

/**
 * Typical panels composed from primitives only. Each story is a docked side
 * panel at a realistic width, so composition problems (hierarchy, section
 * order, action placement) show up here before they ship in a feature.
 */

const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 960;

const PanelFrame = ({ children }: { children: ReactNode }) => (
  <FlexColumn
    sx={{
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
      overflow: "hidden",
      bgcolor: "background.paper",
      border: 1,
      borderColor: "divider"
    }}
  >
    {children}
  </FlexColumn>
);

const PanelBody = ({ children }: { children: ReactNode }) => (
  <FlexColumn gap={3} sx={{ flex: "1 1 auto", overflowY: "auto", px: 3, py: 2 }}>
    {children}
  </FlexColumn>
);

const meta = {
  title: "Patterns/Panels",
  parameters: { layout: "centered" }
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Inspector ──────────────────────────────────────────────────────────────

const modelOptions = [
  { value: "gemini-omni-flash", label: "Gemini Omni Flash" },
  { value: "runway-aleph", label: "Runway Aleph" }
];
const extendModelOptions = [
  { value: "veo-3.1", label: "Veo 3.1 Preview" },
  { value: "kling-2.5", label: "Kling 2.5" }
];
const extendFromOptions = [
  { value: "end", label: "End" },
  { value: "start", label: "Start" }
];
const fitOptions = [
  { value: "fill", label: "Fill" },
  { value: "fit", label: "Fit" },
  { value: "stretch", label: "Stretch" }
];

const GenerateAction = ({
  label,
  cost,
  ready,
  hint
}: {
  label: string;
  cost: string;
  ready: boolean;
  hint: string;
}) => (
  <FlexColumn gap={1}>
    <Button
      fullWidth
      size="small"
      variant="contained"
      color="primary"
      disabled={!ready}
      startIcon={<AutoAwesomeOutlinedIcon />}
    >
      {label}
    </Button>
    <FlexRow justify="space-between">
      <Caption color="secondary">{ready ? "" : hint}</Caption>
      <Caption color="secondary">≈ {cost}</Caption>
    </FlexRow>
  </FlexColumn>
);

const InspectorPanel = () => {
  const [tab, setTab] = useState("inspector");
  const [query, setQuery] = useState("");
  const [instruction, setInstruction] = useState("");
  const [model, setModel] = useState("gemini-omni-flash");
  const [extendModel, setExtendModel] = useState("veo-3.1");
  const [extendFrom, setExtendFrom] = useState("end");
  const [intent, setIntent] = useState("");
  const [fit, setFit] = useState("fill");
  const [loop, setLoop] = useState(false);
  const [start, setStart] = useState("00:00:04.12");
  const [duration, setDuration] = useState("6.79");
  const [speed, setSpeed] = useState("100");

  return (
    <FieldDensityContext.Provider value="compact">
      <PanelFrame>
        <TabGroup
          value={tab}
          onChange={setTab}
          size="small"
          tabs={[
            { value: "inspector", label: "Inspector", icon: <TuneIcon /> },
            { value: "shot", label: "Shot", icon: <MovieOutlinedIcon /> },
            { value: "assistant", label: "Assistant", icon: <AutoAwesomeOutlinedIcon /> },
            { value: "history", label: "History", icon: <HistoryIcon /> }
          ]}
        />
        <PanelBody>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Find a control"
            size="small"
            fullWidth
          />

          <FlexColumn gap={1}>
            <Text size="big">Blue hour – lights on</Text>
            <Caption color="secondary">Video · 6.79s</Caption>
            <FlexRow>
              {/* A link to the board, not a tag: the control radius, as in
                  ClipStoryboardLink, not the pill. */}
              <Chip
                label="from Board · SH 01"
                size="small"
                color="secondary"
                compact
                sx={{ borderRadius: BORDER_RADIUS.md }}
              />
            </FlexRow>
          </FlexColumn>

          <CollapsibleSection iconPosition="end" compact title={<SectionHeader title="Media" size="small" />} defaultOpen>
            <FlexColumn gap={1}>
              <InspectorFieldRow label="Fit">
                <InspectorSelect label="Fit" value={fit} options={fitOptions} onChange={setFit} grow />
              </InspectorFieldRow>
              <InspectorToggleRow label="Loop" checked={loop} onChange={setLoop} />
            </FlexColumn>
          </CollapsibleSection>

          <CollapsibleSection iconPosition="end" compact title={<SectionHeader title="Timing" size="small" />} defaultOpen>
            <FlexColumn gap={1}>
              <InspectorFieldRow label="Start">
                <InspectorValueInput value={start} onCommit={setStart} ariaLabel="Start" grow />
              </InspectorFieldRow>
              <InspectorFieldRow label="Duration">
                <InspectorValueInput value={duration} onCommit={setDuration} unit="s" ariaLabel="Duration" grow />
              </InspectorFieldRow>
              <InspectorFieldRow label="Speed">
                <InspectorValueInput value={speed} onCommit={setSpeed} unit="%" ariaLabel="Speed" grow />
              </InspectorFieldRow>
            </FlexColumn>
          </CollapsibleSection>

          <Divider />

          <CollapsibleSection iconPosition="end" compact title={<SectionHeader title="AI edit" size="small" />} defaultOpen>
            <FlexColumn gap={3}>
              <TextInput
                label="Instruction"
                placeholder="e.g. Make it golden hour"
                multiline
                minRows={1}
                maxRows={6}
                size="small"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
              />
              <SelectField label="Model" value={model} onChange={setModel} options={modelOptions} size="small" />
              <GenerateAction
                label="Edit video"
                cost="$0.70"
                ready={instruction.trim().length > 0}
                hint="Write an instruction"
              />
            </FlexColumn>
          </CollapsibleSection>

          <CollapsibleSection iconPosition="end" compact title={<SectionHeader title="Extend" size="small" />} defaultOpen={false}>
            <FlexColumn gap={3}>
              <SelectField
                label="Extension model"
                value={extendModel}
                onChange={setExtendModel}
                options={extendModelOptions}
                size="small"
              />
              <FlexRow gap={2} align="flex-start">
                <Box sx={{ flex: "1 1 0", minWidth: 0 }}>
                  <SelectField
                    label="Extend from"
                    value={extendFrom}
                    onChange={setExtendFrom}
                    options={extendFromOptions}
                    size="small"
                  />
                </Box>
                <Box sx={{ flex: "1 1 0", minWidth: 0 }}>
                  <TextInput label="Seconds to add" defaultValue="3" type="number" size="small" />
                </Box>
              </FlexRow>
              <TextInput
                label="Extension intent"
                placeholder="e.g. The camera keeps rising"
                multiline
                minRows={1}
                maxRows={6}
                size="small"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
              />
              <GenerateAction
                label="Generate extension"
                cost="$1.20"
                ready={intent.trim().length > 0}
                hint="Describe the extension"
              />
            </FlexColumn>
          </CollapsibleSection>
        </PanelBody>
      </PanelFrame>
    </FieldDensityContext.Provider>
  );
};

/**
 * A clip inspector: identity, clip properties first, then generative actions.
 * The compact field density makes every field share one look and text size.
 */
export const Inspector: Story = {
  render: () => <InspectorPanel />
};

// ── List ───────────────────────────────────────────────────────────────────

const versions = [
  { id: "v7", name: "Final cut", meta: "Today, 14:02 · 12 clips" },
  { id: "v6", name: "Music swap", meta: "Today, 11:40 · 12 clips" },
  { id: "v5", name: "Blue hour retime", meta: "Yesterday · 11 clips" },
  { id: "v4", name: "Rough assembly", meta: "Oct 8 · 9 clips" },
  { id: "v3", name: "Storyboard import", meta: "Oct 7 · 6 clips" }
];

const ListPanel = ({ empty }: { empty: boolean }) => {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("v7");
  const items = empty
    ? []
    : versions.filter((v) => v.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <PanelFrame>
      <PanelHeader
        title="Versions"
        count={empty ? undefined : items.length}
        actions={<ToolbarIconButton icon={<AddIcon />} tooltip="Save version" size="small" />}
        onClose={() => undefined}
      />
      <FlexColumn gap={2} sx={{ flex: "1 1 auto", minHeight: 0, px: 3, py: 2 }}>
        {!empty && (
          <SearchInput value={query} onChange={setQuery} placeholder="Search versions" size="small" fullWidth />
        )}
        {items.length > 0 ? (
          <ListGroup compact flush sx={{ overflowY: "auto" }}>
            {items.map((v) => (
              <ListItemRow
                key={v.id}
                primary={v.name}
                secondary={v.meta}
                icon={<HistoryIcon fontSize="small" />}
                selected={v.id === selected}
                onClick={() => setSelected(v.id)}
              />
            ))}
          </ListGroup>
        ) : (
          <EmptyState
            title={empty ? "No versions yet" : "No matches"}
            description={empty ? "Save a version to return to this state later." : "Try another name."}
            actionText={empty ? "Save version" : undefined}
            onAction={empty ? () => undefined : undefined}
            size="small"
          />
        )}
      </FlexColumn>
    </PanelFrame>
  );
};

/** A docked list: header with count and action, search, selectable rows. */
export const List: Story = {
  render: () => <ListPanel empty={false} />
};

/** The same list with no rows: the empty state carries the next action. */
export const ListEmpty: Story = {
  render: () => <ListPanel empty />
};

// ── Settings ───────────────────────────────────────────────────────────────

const SettingsGroup = ({ title, children }: { title: string; children: ReactNode }) => (
  <FlexColumn gap={1}>
    <SectionHeader title={title} size="small" />
    <FlexColumn
      gap={2}
      sx={{ p: 3, border: 1, borderColor: "divider", borderRadius: "var(--rounded-lg)" }}
    >
      {children}
    </FlexColumn>
  </FlexColumn>
);

const SettingsPanel = () => {
  const [autosave, setAutosave] = useState(true);
  const [snap, setSnap] = useState(true);
  const [waveforms, setWaveforms] = useState(false);
  const [quality, setQuality] = useState("auto");
  const [keys, setKeys] = useState("nodetool");

  return (
    <PanelFrame>
      <PanelHeader title="Timeline settings" onClose={() => undefined} />
      <PanelBody>
        <SettingsGroup title="Editing">
          <LabeledSwitch
            label="Snap to clip edges"
            description="Clips align to neighbours and the playhead."
            checked={snap}
            onChange={setSnap}
          />
          <LabeledSwitch
            label="Autosave"
            description="Save the sequence after every change."
            checked={autosave}
            onChange={setAutosave}
          />
          <SelectField
            label="Keyboard layout"
            value={keys}
            onChange={setKeys}
            options={[
              { value: "nodetool", label: "NodeTool" },
              { value: "premiere", label: "Premiere Pro" },
              { value: "fcp", label: "Final Cut Pro" }
            ]}
            size="small"
          />
        </SettingsGroup>
        <SettingsGroup title="Preview">
          <SelectField
            label="Preview quality"
            value={quality}
            onChange={setQuality}
            options={[
              { value: "auto", label: "Auto" },
              { value: "full", label: "Full" },
              { value: "half", label: "Half" }
            ]}
            size="small"
          />
          <LabeledSwitch
            label="Show waveforms"
            description="Draw audio waveforms on clips."
            checked={waveforms}
            onChange={setWaveforms}
          />
        </SettingsGroup>
        <SettingsGroup title="Media">
          <FlexRow justify="space-between" align="center">
            <FlexRow gap={2} align="center">
              <ImageOutlinedIcon fontSize="small" />
              <FlexColumn>
                <Text>Proxy cache</Text>
                <Caption color="secondary">1.4 GB on disk</Caption>
              </FlexColumn>
            </FlexRow>
            <Button size="small" variant="outlined">Clear</Button>
          </FlexRow>
        </SettingsGroup>
      </PanelBody>
    </PanelFrame>
  );
};

/** Grouped settings: small section headers over bordered groups of rows. */
export const Settings: Story = {
  render: () => <SettingsPanel />
};
