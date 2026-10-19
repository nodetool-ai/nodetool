/**
 * FX device views for `fable` effects: the upstream FableSynth FX panels in
 * their dark hardware frame, bound to one track or master effect. One
 * component per effect kind, each registered as `fable:<kind>`.
 */

import type * as React from "react";
import { useTranslation } from "react-i18next";

import type { FableEffectKind } from "@nodetool-ai/timeline";

import type { FxDeviceViewProps } from "../devices/deviceViews";
import { ChorusPanel } from "../fablesynth/components/panels/ChorusPanel";
import { DrivePanel } from "../fablesynth/components/panels/DrivePanel";
import { DynamicsPanel } from "../fablesynth/components/panels/DynamicsPanel";
import { EqPanel } from "../fablesynth/components/panels/EqPanel";
import { LabPanel } from "../fablesynth/components/panels/LabPanel";
import { ReverbPanel } from "../fablesynth/components/panels/ReverbPanel";
import { TapeEchoPanel } from "../fablesynth/components/panels/TapeEchoPanel";
import type { FxPanelAdapter } from "../fablesynth/components/panels/fxAdapter";
import { FABLE_FX_LABELS } from "./fableFxParams";
import { useFableFxDevice } from "./useFableFxDevice";
import "./fxBase.css";

function renderPanel(kind: FableEffectKind, adapter: FxPanelAdapter): React.ReactNode {
  switch (kind) {
    case "eq":
      return <EqPanel adapter={adapter} />;
    case "ott":
      return <DynamicsPanel kind="ott" adapter={adapter} />;
    case "comp":
      return <DynamicsPanel kind="comp" adapter={adapter} />;
    case "drive":
      return <DrivePanel adapter={adapter} />;
    case "lab":
      return <LabPanel adapter={adapter} />;
    case "chorus":
      return <ChorusPanel adapter={adapter} />;
    case "echo":
      return <TapeEchoPanel adapter={adapter} />;
    case "reverb":
      return <ReverbPanel adapter={adapter} />;
  }
}

function FableFxDevice({
  kind,
  trackId,
  effectId
}: FxDeviceViewProps & { kind: FableEffectKind }): React.ReactElement | null {
  const { t } = useTranslation();
  const { effect, adapter } = useFableFxDevice(trackId, effectId);
  if (!effect || !adapter) return null;
  if (effect.kind !== kind) return null;
  return (
    <div
      className="fablesynth fable-fx-device"
      data-kind={kind}
      data-testid={`fable-fx-${effectId}`}
      aria-label={t("i18n-next77.fxDevice.ariaLabel", { name: FABLE_FX_LABELS[kind] })}
    >
      {renderPanel(kind, adapter)}
    </div>
  );
}

const view = (kind: FableEffectKind) => {
  const View = (props: FxDeviceViewProps): React.ReactElement | null => (
    <FableFxDevice kind={kind} {...props} />
  );
  View.displayName = `FableFx(${kind})`;
  return View;
};

export const EqDeviceView = view("eq");
export const OttDeviceView = view("ott");
export const CompDeviceView = view("comp");
export const DriveDeviceView = view("drive");
export const LabDeviceView = view("lab");
export const ChorusDeviceView = view("chorus");
export const EchoDeviceView = view("echo");
export const ReverbDeviceView = view("reverb");

export const FABLE_FX_VIEWS: Record<FableEffectKind, (props: FxDeviceViewProps) => React.ReactElement | null> = {
  eq: EqDeviceView,
  ott: OttDeviceView,
  comp: CompDeviceView,
  drive: DriveDeviceView,
  lab: LabDeviceView,
  chorus: ChorusDeviceView,
  echo: EchoDeviceView,
  reverb: ReverbDeviceView
};
