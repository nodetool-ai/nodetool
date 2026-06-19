import * as React from "react";
import { LabeledToggle, FlexColumn, FlexRow, Text } from "nodetool";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import PsychologyIcon from "@mui/icons-material/Psychology";
import InfoIcon from "@mui/icons-material/Info";

export const CollapsibleSection = () => {
  const [open, setOpen] = React.useState(true);
  return (
    <FlexColumn gap={1} style={{ width: 360 }}>
      <FlexRow gap={1} align="center">
        <LabeledToggle
          isOpen={open}
          onToggle={() => setOpen((v) => !v)}
          showLabel="Show reasoning"
          hideLabel="Hide reasoning"
          icon={<LightbulbIcon fontSize="inherit" />}
          showTooltip={false}
        />
        <Text size="small">{open ? "Hide reasoning" : "Show reasoning"}</Text>
      </FlexRow>
      {open && (
        <Text size="small" color="secondary">
          The agent compared three candidate models before selecting Sonnet.
        </Text>
      )}
    </FlexColumn>
  );
};

export const ModeToggle = () => {
  const [agent, setAgent] = React.useState(true);
  return (
    <FlexRow gap={1} align="center">
      <LabeledToggle
        isOpen={agent}
        onToggle={() => setAgent((v) => !v)}
        icon={<PsychologyIcon fontSize="small" />}
        showExpandIcon={false}
        showTooltip={false}
      />
      <Text size="small">Agent mode {agent ? "on" : "off"}</Text>
    </FlexRow>
  );
};

export const States = () => (
  <FlexColumn gap={1.5}>
    <FlexRow gap={1} align="center">
      <LabeledToggle
        isOpen={false}
        onToggle={() => {}}
        icon={<InfoIcon fontSize="inherit" />}
        showTooltip={false}
      />
      <Text size="small" color="secondary">
        Collapsed
      </Text>
    </FlexRow>
    <FlexRow gap={1} align="center">
      <LabeledToggle
        isOpen
        onToggle={() => {}}
        icon={<InfoIcon fontSize="inherit" />}
        showTooltip={false}
      />
      <Text size="small">Expanded</Text>
    </FlexRow>
    <FlexRow gap={1} align="center">
      <LabeledToggle
        isOpen={false}
        onToggle={() => {}}
        icon={<InfoIcon fontSize="inherit" />}
        disabled
        showTooltip={false}
      />
      <Text size="small" color="secondary">
        Disabled
      </Text>
    </FlexRow>
  </FlexColumn>
);
