/** @jsxImportSource @emotion/react */
/**
 * SynthModuleBody — shared bespoke body for the modular-synthesis audio
 * nodes. Renders a Eurorack-style faceplate: input jacks on the left
 * (HandleColumn), a module label strip, optional waveform selector / mode
 * toggle / ADSR preview, and a grid of rotary knobs for the numeric
 * parameters. Per-node configuration lives in `synthModules.ts`.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { ToggleGroup, ToggleOption } from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useWebsocketRunner } from "../../../stores/WorkflowRunner";
import AdsrPreview from "./AdsrPreview";
import SynthKnob, { synthKnobStyles } from "./SynthKnob";
import {
  SYNTH_MODULE_CONFIGS,
  type SynthAccent
} from "./synthModules";
import WaveformSelector, {
  waveformSelectorStyles
} from "./WaveformSelector";

const styles = (theme: Theme) =>
  css({
    "&.synth-module-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.75),
      padding: theme.spacing(1),
      minHeight: 0,
      borderRadius: "var(--rounded-sm)",
      backgroundColor: theme.vars.palette.grey[900]
    },
    "& > .handle-column": {
      top: theme.spacing(1),
      bottom: theme.spacing(1),
      left: 0
    },
    ".module-label": {
      alignSelf: "center",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeTiny,
      fontWeight: 700,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      lineHeight: 1,
      color: theme.vars.palette.text.secondary,
      padding: `2px ${theme.spacing(1)}`,
      borderRadius: "var(--rounded-sm)",
      border: `1px solid ${theme.vars.palette.grey[800]}`
    },
    ".adsr-preview": {
      padding: `0 ${theme.spacing(0.5)}`
    },
    ".mode-toggle": {
      alignSelf: "center",
      ".MuiToggleButton-root": {
        padding: `2px ${theme.spacing(1.5)}`,
        fontSize: theme.fontSizeTiny,
        fontFamily: theme.fontFamily2,
        lineHeight: 1.4,
        minWidth: 0
      }
    },
    ".knob-grid": {
      flex: "1 1 auto",
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "center",
      alignItems: "flex-start",
      alignContent: "center",
      columnGap: theme.spacing(0.5),
      rowGap: theme.spacing(1),
      minHeight: 0
    },
    ".jack-labels": {
      display: "flex",
      flexDirection: "column",
      gap: 2,
      position: "absolute",
      left: theme.spacing(1.25),
      top: theme.spacing(1),
      pointerEvents: "none"
    },
    ".jack-label": {
      fontSize: theme.fontSizeTiny,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      lineHeight: "18px",
      height: 18,
      marginBottom: theme.spacing(2),
      "&:last-child": { marginBottom: 0 }
    },
    ".outputs-row": {
      flex: "0 0 auto"
    },
    /* Collapsed: hide the faceplate, keep handles. */
    ".node-body.collapsed &.synth-module-body": {
      padding: 0,
      gap: 0,
      minHeight: 0,
      height: 0,
      overflow: "visible",
      "& > .module-label, & > .adsr-preview, & > .mode-toggle, & > .knob-grid, & > .waveform-row, & > .jack-labels":
        {
          display: "none"
        },
      "& > .outputs-row": {
        height: 0,
        minHeight: 0,
        padding: 0
      }
    }
  });

const ACCENT_FALLBACK: SynthAccent = "primary";

export interface SynthModuleBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const SynthModuleBodyInner: React.FC<SynthModuleBodyProps> = ({
  id,
  nodeType,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(
    () => [styles(theme), synthKnobStyles(theme), waveformSelectorStyles(theme)],
    [theme]
  );

  const config = SYNTH_MODULE_CONFIGS[nodeType];
  const accentColor =
    theme.vars.palette[config?.accent ?? ACCENT_FALLBACK].main;

  const inputProperties = useMemo(() => {
    const names = new Set(config?.inputs ?? []);
    return (nodeMetadata.properties ?? []).filter((p) => names.has(p.name));
  }, [config, nodeMetadata.properties]);

  const props = data.properties ?? {};

  const { setProperty, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  // Live parameter path: while a patch is running, knob/selector changes are
  // also pushed straight into the running job's node instance, so the sound
  // follows the knob. Throttled to chunk-ish cadence; trailing value wins.
  const updateRunningNodeProperties = useWebsocketRunner(
    (s) => s.updateRunningNodeProperties
  );
  const liveThrottle = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    pending: Record<string, unknown>;
  }>({ timer: null, pending: {} });
  const pushLive = useCallback(
    (name: string, value: unknown) => {
      const t = liveThrottle.current;
      t.pending[name] = value;
      if (t.timer !== null) {
        return;
      }
      t.timer = setTimeout(() => {
        t.timer = null;
        const updates = t.pending;
        t.pending = {};
        updateRunningNodeProperties(id, updates);
      }, 33);
    },
    [id, updateRunningNodeProperties]
  );
  useEffect(() => {
    const t = liveThrottle.current;
    return () => {
      if (t.timer !== null) {
        clearTimeout(t.timer);
      }
    };
  }, []);

  const handleKnobChange = useCallback(
    (name: string, v: number) => {
      setProperty(name, v);
      pushLive(name, v);
    },
    [pushLive, setProperty]
  );

  const handleWaveformChange = useCallback(
    (value: string) => {
      setProperty(config!.waveform!.name, value);
      pushLive(config!.waveform!.name, value);
      setPropertyComplete();
    },
    [config, pushLive, setProperty, setPropertyComplete]
  );

  const handleModeChange = useCallback(
    (_: unknown, value: string | null) => {
      if (value !== null) {
        setProperty(config!.modeToggle!.name, value);
        pushLive(config!.modeToggle!.name, value);
        setPropertyComplete();
      }
    },
    [config, pushLive, setProperty, setPropertyComplete]
  );

  if (!config) {
    return null;
  }

  const numberProp = (name: string, def: number): number => {
    const v = Number(props[name]);
    return Number.isFinite(v) ? v : def;
  };

  return (
    <div
      css={cssStyles}
      className="synth-module-body"
      data-bespoke-body="SynthModule"
    >
      <HandleColumn id={id} properties={inputProperties} />
      {inputProperties.length > 0 && (
        <div className="jack-labels" aria-hidden="true">
          {inputProperties.map((p) => (
            <span key={p.name} className="jack-label">
              {p.name.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}

      <span className="module-label">{config.label}</span>

      {config.waveform && (
        <WaveformSelector
          options={config.waveform.options}
          value={String(props[config.waveform.name] ?? config.waveform.default)}
          accentColor={accentColor}
          onChange={handleWaveformChange}
        />
      )}

      {config.modeToggle && (
        <ToggleGroup
          className="mode-toggle nodrag"
          size="small"
          exclusive
          value={String(
            props[config.modeToggle.name] ?? config.modeToggle.default
          )}
          onChange={handleModeChange}
          aria-label={config.modeToggle.name}
        >
          {config.modeToggle.options.map((o) => (
            <ToggleOption key={o.value} value={o.value}>
              {o.label}
            </ToggleOption>
          ))}
        </ToggleGroup>
      )}

      {config.adsrPreview && (
        <div className="adsr-preview">
          <AdsrPreview
            attack={numberProp("attack", 0.01)}
            decay={numberProp("decay", 0.1)}
            sustain={numberProp("sustain", 0.7)}
            release={numberProp("release", 0.3)}
            accentColor={accentColor}
          />
        </div>
      )}

      {config.knobs.length > 0 && (
        <div className="knob-grid">
          {config.knobs.map((spec) => (
            <SynthKnob
              key={spec.name}
              spec={spec}
              value={numberProp(spec.name, spec.default)}
              accentColor={accentColor}
              onChange={handleKnobChange}
              onCommit={setPropertyComplete}
            />
          ))}
        </div>
      )}

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
        </div>
      )}

      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const SynthModuleBody = memo(SynthModuleBodyInner);
SynthModuleBody.displayName = "SynthModuleBody";
export default SynthModuleBody;
