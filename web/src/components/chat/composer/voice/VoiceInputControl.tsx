import React, { memo, useEffect, useRef, useState } from "react";
import { keyframes } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import MicNoneRoundedIcon from "@mui/icons-material/MicNoneRounded";
import {
  MOTION,
  ToolbarIconButton,
  reducedMotion
} from "../../../ui_primitives";
import ASRModelMenuDialog from "../../../model_menu/ASRModelMenuDialog";
import { VoiceRecordingBar } from "./VoiceRecordingBar";
import {
  useVoiceInput,
  type UseVoiceInputReturn
} from "./useVoiceInput";
import {
  VOICE_DICTATION_SHORTCUT,
  registerVoiceShortcutTarget
} from "./voiceShortcut";

const recordingPulse = keyframes`
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.65;
  }
`;

export interface VoiceInputControlProps {
  /** Called with the transcript once a recording is accepted (uncontrolled mode). */
  onTranscript?: (text: string) => void;
  /** Called when the user requested send before transcription finished (uncontrolled mode). */
  onSubmitTranscript?: (text: string) => void;
  /**
   * The container the inline recording bar portals into when this control owns
   * its own voice session (e.g. SelectionAssistPlugin).
   */
  overlayHost?: React.RefObject<HTMLElement | null>;
  /**
   * Optional voice session owned by the parent composer. When supplied, this
   * control renders the mic button, shortcut binding, and model picker without
   * creating a duplicate recorder.
   */
  voice?: Readonly<UseVoiceInputReturn>;
  /** Container used to scope keyboard shortcut focus priority. Defaults to `overlayHost`. */
  shortcutHost?: React.RefObject<HTMLElement | null>;
  /** Whether to portal `VoiceRecordingBar` into `overlayHost`. Defaults to true when uncontrolled. */
  renderBar?: boolean;
  disabled?: boolean;
}

interface VoiceInputControlViewProps {
  voice: Readonly<UseVoiceInputReturn>;
  overlayHost?: React.RefObject<HTMLElement | null>;
  shortcutHost?: React.RefObject<HTMLElement | null>;
  renderBar: boolean;
  disabled: boolean;
}

const isElementAvailable = (element: HTMLElement | null): boolean => {
  if (!element || !element.isConnected) {
    return false;
  }
  return (
    element.closest("[hidden]") === null &&
    element.closest('[aria-hidden="true"]') === null
  );
};

const VoiceInputControlView = memo(function VoiceInputControlView({
  voice,
  overlayHost,
  shortcutHost,
  renderBar,
  disabled
}: VoiceInputControlViewProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const micRef = useRef<HTMLButtonElement>(null);
  // Read after mount: refs are still null on the first render pass, and the
  // bar can be active on the very next one.
  const [overlayElement, setOverlayElement] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setOverlayElement(overlayHost?.current ?? null);
  }, [overlayHost]);

  const scopeRef = shortcutHost ?? overlayHost;
  const shortcutStateRef = useRef({
    disabled,
    phase: voice.phase,
    toggle: voice.toggleRecording
  });
  shortcutStateRef.current = {
    disabled,
    phase: voice.phase,
    toggle: voice.toggleRecording
  };

  useEffect(() => {
    return registerVoiceShortcutTarget({
      isEnabled: () => !shortcutStateRef.current.disabled,
      isActive: () => shortcutStateRef.current.phase !== "idle",
      isRecording: () => shortcutStateRef.current.phase === "recording",
      containsNode: (node) => {
        if (!node) {
          return false;
        }
        const host = scopeRef?.current;
        if (host && host.contains(node)) {
          return true;
        }
        return micRef.current?.contains(node) ?? false;
      },
      isConnected: () =>
        isElementAvailable(scopeRef?.current ?? micRef.current),
      toggle: () => shortcutStateRef.current.toggle()
    });
  }, [scopeRef]);

  const isRecording = voice.phase === "recording";
  const isTranscribing = voice.phase === "transcribing";
  const isActive = voice.phase !== "idle";

  const micLabel = isRecording
    ? t("i18n-next54.composer.voice.stop", "Stop recording")
    : t("i18n-next54.composer.voice.record", "Record voice message");

  return (
    <>
      {renderBar &&
        isActive &&
        overlayElement &&
        createPortal(
          <VoiceRecordingBar
            levelsRef={voice.levelsRef}
            durationMs={voice.durationMs}
            isTranscribing={isTranscribing}
            pendingSend={voice.pendingSend}
            onCancel={voice.cancelRecording}
          />,
          overlayElement
        )}
      <ToolbarIconButton
        ref={micRef}
        className="voice-input-button"
        aria-label={micLabel}
        tooltip={micLabel}
        shortcut={VOICE_DICTATION_SHORTCUT}
        icon={<MicNoneRoundedIcon fontSize="small" />}
        variant={isRecording ? "error" : "default"}
        active={isRecording}
        onClick={voice.toggleRecording}
        disabled={disabled || isTranscribing}
        nodrag={false}
        sx={
          isRecording
            ? {
                backgroundColor: "rgba(var(--palette-error-mainChannel) / 0.16)",
                color: theme.vars.palette.error.main,
                animation: `${recordingPulse} ${MOTION.pulse} infinite`,
                ...reducedMotion({ animation: "none" }),
                "&:hover": {
                  backgroundColor:
                    "rgba(var(--palette-error-mainChannel) / 0.24)",
                  color: theme.vars.palette.error.main
                }
              }
            : undefined
        }
      />
      <ASRModelMenuDialog
        open={voice.isConfigOpen}
        anchorEl={voice.isConfigOpen ? micRef.current : null}
        onClose={voice.closeConfig}
        onModelChange={voice.selectModel}
      />
    </>
  );
});

const UncontrolledVoiceInputControl = memo(
  function UncontrolledVoiceInputControl({
    onTranscript,
    onSubmitTranscript,
    overlayHost,
    shortcutHost,
    renderBar = true,
    disabled = false
  }: Omit<VoiceInputControlProps, "voice">) {
    const voice = useVoiceInput({
      onTranscript: onTranscript ?? (() => undefined),
      onSubmitTranscript
    });

    return (
      <VoiceInputControlView
        voice={voice}
        overlayHost={overlayHost}
        shortcutHost={shortcutHost}
        renderBar={renderBar}
        disabled={disabled}
      />
    );
  }
);

/**
 * The composer's mic: toggles dictation on click or `Alt+Shift+M`, opens the
 * model picker when no speech-to-text default is pinned, and optionally portals
 * the inline recording strip into `overlayHost`.
 */
export const VoiceInputControl = memo(function VoiceInputControl(
  props: VoiceInputControlProps
) {
  if (props.voice) {
    return (
      <VoiceInputControlView
        voice={props.voice}
        overlayHost={props.overlayHost}
        shortcutHost={props.shortcutHost}
        renderBar={props.renderBar ?? false}
        disabled={props.disabled ?? false}
      />
    );
  }
  return <UncontrolledVoiceInputControl {...props} />;
});

export default VoiceInputControl;
