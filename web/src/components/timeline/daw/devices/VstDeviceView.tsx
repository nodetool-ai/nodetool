/**
 * The device view of a VST instrument track: which plug-in it loads, and a
 * button that opens the plug-in's own window. The window belongs to the
 * desktop app's VST host; each sound change made there comes back as plug-in
 * state and is written to the track, so the timeline document keeps it and the
 * next render plays it. The browser build has no host and says so.
 */

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { VstMidiInstrument } from "@nodetool-ai/timeline";

import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../../../stores/timeline/TimelineInstance";
import {
  AlertBanner,
  Button,
  Caption,
  FlexColumn,
  FlexRow,
  SelectField,
  SPACING
} from "../../../ui_primitives";
import type { InstrumentDeviceViewProps } from "./deviceViews";
import {
  vstBridge,
  vstEditorInstance,
  type VstBridge,
  type VstPluginInfo
} from "./vstBridge";

const PLUGINS_KEY = ["vst-plugins"] as const;
const STATUS_KEY = ["vst-status"] as const;

/** Mounted views per editor instance: the window closes with the last one. */
const viewsOpen = new Map<string, number>();

function pluginLabel(plugin: Pick<VstPluginInfo, "name" | "vendor">): string {
  return plugin.vendor ? `${plugin.name} · ${plugin.vendor}` : plugin.name;
}

export default function VstDeviceView({ trackId }: InstrumentDeviceViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const bridge = vstBridge();
  if (!bridge) {
    return (
      <AlertBanner severity="info" compact data-testid="vst-desktop-only">
        {t("i18n-next59.vst.desktopOnly")}
      </AlertBanner>
    );
  }
  return <VstHostedView trackId={trackId} bridge={bridge} />;
}

function VstHostedView({
  trackId,
  bridge
}: InstrumentDeviceViewProps & { bridge: VstBridge }): React.JSX.Element {
  const { t } = useTranslation();
  const doc = useTimelineStoreApi();
  const queryClient = useQueryClient();
  const track = useTimelineStore((s) => s.tracks.find((x) => x.id === trackId));
  const instrument: VstMidiInstrument | null =
    track?.instrument?.type === "vst" ? track.instrument : null;
  const readOnly = !track || track.locked === true;
  const instance = vstEditorInstance(trackId);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const status = useQuery({ queryKey: STATUS_KEY, queryFn: () => bridge.status() });
  const available = status.data?.available === true;
  const plugins = useQuery({
    queryKey: PLUGINS_KEY,
    queryFn: () => bridge.scan(false),
    enabled: available,
    staleTime: Infinity
  });

  // The plug-in window reports each sound change; the track stores it.
  useEffect(() => {
    const writeState = (state: string | undefined) => {
      if (state === undefined) return;
      const current = doc.getState().tracks.find((x) => x.id === trackId);
      if (current?.instrument?.type !== "vst" || current.instrument.state === state) return;
      doc.getState().setTrackInstrument(trackId, { ...current.instrument, state: state || null });
    };
    return bridge.onEvent((event) => {
      if (event.event === "exited") {
        setEditorOpen(false);
        return;
      }
      if (event.instance !== instance) return;
      writeState(event.state);
      if (event.event === "editorClosed") setEditorOpen(false);
    });
  }, [bridge, doc, instance, trackId]);

  // The window closes when the last view of this track goes away.
  useEffect(() => {
    viewsOpen.set(instance, (viewsOpen.get(instance) ?? 0) + 1);
    return () => {
      const left = (viewsOpen.get(instance) ?? 1) - 1;
      if (left > 0) {
        viewsOpen.set(instance, left);
        return;
      }
      viewsOpen.delete(instance);
      void bridge.closeEditor(instance).catch(() => {});
    };
  }, [bridge, instance]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const choose = (key: string) => {
    const plugin = plugins.data?.find((p) => `${p.path}\n${p.uid}` === key);
    if (!plugin || !instrument) return;
    void run(async () => {
      if (editorOpen) {
        await bridge.closeEditor(instance);
        setEditorOpen(false);
      }
      doc.getState().setTrackInstrument(trackId, {
        ...instrument,
        plugin: { uid: plugin.uid, name: plugin.name, vendor: plugin.vendor, path: plugin.path },
        state: null
      });
    });
  };

  const rescan = () =>
    run(async () => {
      queryClient.setQueryData(PLUGINS_KEY, await bridge.scan(true));
    });

  const toggleEditor = () =>
    run(async () => {
      if (editorOpen) {
        await bridge.closeEditor(instance);
        setEditorOpen(false);
        return;
      }
      if (!instrument?.plugin) return;
      await bridge.openEditor({
        instance,
        plugin: { path: instrument.plugin.path, uid: instrument.plugin.uid },
        state: instrument.state,
        title: `${instrument.plugin.name} · ${track?.name ?? ""}`
      });
      setEditorOpen(true);
    });

  if (status.isPending) {
    return <Caption color="muted">{t("i18n-next59.vst.checking")}</Caption>;
  }
  if (!available) {
    return (
      <AlertBanner severity="warning" compact data-testid="vst-host-missing">
        {status.data?.reason ?? t("i18n-next59.vst.hostMissing")}
      </AlertBanner>
    );
  }

  const chosen = instrument?.plugin ?? null;
  const chosenKey = chosen ? `${chosen.path}\n${chosen.uid}` : "";
  const list = plugins.data ?? [];
  const options = list.map((p) => ({ value: `${p.path}\n${p.uid}`, label: pluginLabel(p) }));
  // A plug-in saved on another machine is shown even when this one lacks it.
  if (chosen && !list.some((p) => `${p.path}\n${p.uid}` === chosenKey)) {
    options.unshift({ value: chosenKey, label: t("i18n-next59.vst.missingPlugin", { name: pluginLabel(chosen) }) });
  }

  return (
    <FlexColumn gap={SPACING.sm} data-testid="vst-device">
      <SelectField
        label={t("i18n-next59.vst.plugin")}
        size="small"
        value={chosenKey}
        disabled={readOnly || busy || plugins.isPending}
        options={[{ value: "", label: t("i18n-next59.vst.choose") }, ...options]}
        onChange={choose}
      />
      {plugins.isPending && <Caption color="muted">{t("i18n-next59.vst.scanning")}</Caption>}
      {plugins.isSuccess && list.length === 0 && (
        <Caption color="muted">{t("i18n-next59.vst.none")}</Caption>
      )}
      <FlexRow gap={SPACING.sm}>
        <Button
          size="small"
          variant="outlined"
          disabled={readOnly || busy || !chosen}
          aria-pressed={editorOpen}
          onClick={() => void toggleEditor()}
        >
          {editorOpen ? t("i18n-next59.vst.closeWindow") : t("i18n-next59.vst.openWindow")}
        </Button>
        <Button size="small" variant="text" disabled={busy} onClick={() => void rescan()}>
          {t("i18n-next59.vst.rescan")}
        </Button>
      </FlexRow>
      {(error || plugins.error) && (
        <Caption role="alert">{error || String(plugins.error)}</Caption>
      )}
      <Caption color="muted">{t("i18n-next59.vst.hint")}</Caption>
    </FlexColumn>
  );
}
