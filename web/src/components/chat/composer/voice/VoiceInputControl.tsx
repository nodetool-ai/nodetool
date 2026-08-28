import React, { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import MicNoneRoundedIcon from "@mui/icons-material/MicNoneRounded";
import { ToolbarIconButton } from "../../../ui_primitives";
import ASRModelMenuDialog from "../../../model_menu/ASRModelMenuDialog";
import { VoiceRecordingBar } from "./VoiceRecordingBar";
import { useVoiceInput } from "./useVoiceInput";

interface VoiceInputControlProps {
  /** Called with the transcript once a recording is accepted. */
  onTranscript: (text: string) => void;
  /**
   * The composer card the recording bar covers. The bar is portalled into it
   * so the button can sit anywhere in the footer without the bar inheriting
   * the footer's own positioning context.
   */
  overlayHost: React.RefObject<HTMLElement | null>;
  disabled?: boolean;
}

/**
 * The composer's mic: the button, the recording bar that takes over the
 * composer while recording, and the model picker shown when no speech-to-text
 * default is pinned.
 */
export const VoiceInputControl = memo(function VoiceInputControl({
  onTranscript,
  overlayHost,
  disabled = false
}: VoiceInputControlProps) {
  const micRef = useRef<HTMLButtonElement>(null);
  // Read after mount: refs are still null on the first render pass, and the
  // bar can be active on the very next one.
  const [overlayElement, setOverlayElement] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setOverlayElement(overlayHost.current);
  }, [overlayHost]);
  const {
    phase,
    durationMs,
    levelsRef,
    startRecording,
    confirmRecording,
    cancelRecording,
    isConfigOpen,
    closeConfig,
    selectModel
  } = useVoiceInput({ onTranscript });

  const isActive = phase !== "idle";

  return (
    <>
      {isActive &&
        overlayElement &&
        createPortal(
          <VoiceRecordingBar
            levelsRef={levelsRef}
            durationMs={durationMs}
            isTranscribing={phase === "transcribing"}
            onConfirm={confirmRecording}
            onCancel={cancelRecording}
          />,
          overlayElement
        )}
      <ToolbarIconButton
        ref={micRef}
        className="voice-input-button"
        aria-label="Record voice message"
        tooltip="Record voice message"
        icon={<MicNoneRoundedIcon fontSize="small" />}
        onClick={startRecording}
        disabled={disabled || isActive}
        nodrag={false}
      />
      <ASRModelMenuDialog
        open={isConfigOpen}
        anchorEl={isConfigOpen ? micRef.current : null}
        onClose={closeConfig}
        onModelChange={selectModel}
      />
    </>
  );
});

export default VoiceInputControl;
