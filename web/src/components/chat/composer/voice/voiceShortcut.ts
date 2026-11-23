export const VOICE_DICTATION_SHORTCUT = ["Alt", "Shift", "M"];

/**
 * Matches the global/composer voice dictation toggle shortcut (Alt+Shift+M).
 */
export function isVoiceDictationShortcut(event: KeyboardEvent): boolean {
  return (
    !event.repeat &&
    event.altKey &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.code === "KeyM"
  );
}

export interface VoiceShortcutTarget {
  isEnabled: () => boolean;
  isActive: () => boolean;
  isRecording: () => boolean;
  containsNode: (node: Node | null) => boolean;
  isConnected: () => boolean;
  toggle: () => void;
}

const registeredTargets: VoiceShortcutTarget[] = [];

function handleWindowKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented || !isVoiceDictationShortcut(event)) {
    return;
  }

  // Priority 1: an already-active dictation session owns the shortcut so the
  // user can stop recording even if focus moved away, and an in-flight
  // transcription never starts a competing composer.
  const activeTarget = registeredTargets.find((target) => target.isActive());
  if (activeTarget) {
    event.preventDefault();
    if (activeTarget.isEnabled() && activeTarget.isRecording()) {
      activeTarget.toggle();
    }
    return;
  }

  // Priority 2: the composer/control that currently contains focus.
  const activeElement =
    typeof document !== "undefined" ? document.activeElement : null;
  const focusedTarget = registeredTargets.find(
    (target) => target.isEnabled() && target.containsNode(activeElement)
  );
  if (focusedTarget) {
    event.preventDefault();
    focusedTarget.toggle();
    return;
  }

  // Priority 3: the topmost (most recently mounted) enabled connected control.
  for (let i = registeredTargets.length - 1; i >= 0; i -= 1) {
    const candidate = registeredTargets[i];
    if (candidate.isEnabled() && candidate.isConnected()) {
      event.preventDefault();
      candidate.toggle();
      return;
    }
  }
}

/**
 * Registers a voice input control with the shared window `Alt+Shift+M` listener.
 * Returns an unsubscribe function.
 */
export function registerVoiceShortcutTarget(
  target: VoiceShortcutTarget
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  if (registeredTargets.length === 0) {
    window.addEventListener("keydown", handleWindowKeyDown);
  }
  registeredTargets.push(target);

  return () => {
    const index = registeredTargets.indexOf(target);
    if (index !== -1) {
      registeredTargets.splice(index, 1);
    }
    if (registeredTargets.length === 0) {
      window.removeEventListener("keydown", handleWindowKeyDown);
    }
  };
}
