/**
 * Recording audio on the phone, for the `AudioRecorder` widget.
 *
 * Its own module because a recorder is a small state machine — permission,
 * prepare, record, stop, play back the take — and none of that belongs in the
 * widget file. What it hands back is a `CapturedFile`; the widget uploads it
 * through `uploadCapturedFile`, so a recording and a picked file reach the
 * workflow as the same `{type, uri, asset_id}`.
 *
 * expo-audio's recorder is prepared before every take: `record()` on a recorder
 * that was already stopped does nothing until `prepareToRecordAsync()` runs
 * again, and iOS needs `allowsRecording` on the audio session while the take is
 * in progress and off afterwards, or playback comes out through the earpiece.
 */
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";

import { formatDuration } from "@nodetool-ai/app-runtime";

import type { ThemeColors } from "../../utils/theme";
import type { CapturedFile } from "./mediaPicker";

const PRESET = RecordingPresets.HIGH_QUALITY;

/** How often the elapsed counter refreshes while a take runs. */
const TICK_MS = 250;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".caf": "audio/x-caf",
  ".3gp": "audio/3gpp",
  ".webm": "audio/webm",
  ".wav": "audio/wav",
};

/**
 * The recorder names the file it wrote, and its extension is what says which
 * container came out — the preset differs per platform (`.m4a`, `.3gp` on an
 * Android low-quality take), so reading the URI beats assuming.
 */
export const describeRecording = (uri: string): CapturedFile => {
  const path = uri.split("?")[0];
  const dot = path.lastIndexOf(".");
  const extension =
    dot > path.lastIndexOf("/") ? path.slice(dot).toLowerCase() : PRESET.extension ?? ".m4a";
  return {
    uri,
    name: `recording_${Date.now()}${extension}`,
    mimeType: MIME_BY_EXTENSION[extension] ?? "audio/mp4",
  };
};

interface AudioCaptureControlProps {
  colors: ThemeColors;
  disabled?: boolean;
  /** Set while the widget uploads the take — the controls stay put, but inert. */
  busy?: boolean;
  onCaptured: (file: CapturedFile) => void;
}

/**
 * Record / stop, the elapsed time, and playback of the take just recorded.
 * A refused microphone permission is stated here rather than swallowed.
 */
export const AudioCaptureControl: React.FC<AudioCaptureControlProps> = ({
  colors,
  disabled,
  busy,
  onCaptured,
}) => {
  const recorder = useAudioRecorder(PRESET);
  const recorderState = useAudioRecorderState(recorder, TICK_MS);
  const [takeUri, setTakeUri] = useState<string | null>(null);
  const [takeMillis, setTakeMillis] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const player = useAudioPlayer(takeUri);
  const playerStatus = useAudioPlayerStatus(player);

  const start = useCallback(async () => {
    setNotice(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setNotice(
        permission.canAskAgain
          ? "Microphone access is needed to record. Allow it, or pick an existing file."
          : "Microphone access is off for NodeTool. Turn it on in Settings, or pick an existing file."
      );
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setTakeUri(null);
      setTakeMillis(0);
    } catch (error) {
      console.error("Failed to start recording:", error);
      setNotice("This device could not start recording. Pick an existing file instead.");
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    const elapsed = recorderState.durationMillis;
    try {
      await recorder.stop();
    } catch (error) {
      console.error("Failed to stop recording:", error);
      setNotice("The recording could not be saved. Try again, or pick an existing file.");
      return;
    } finally {
      await setAudioModeAsync({ allowsRecording: false });
    }
    const uri = recorder.uri;
    if (!uri) {
      setNotice("The recording came back empty. Try again, or pick an existing file.");
      return;
    }
    setTakeUri(uri);
    setTakeMillis(elapsed);
    onCaptured(describeRecording(uri));
  }, [onCaptured, recorder, recorderState.durationMillis]);

  const togglePlayback = useCallback(() => {
    if (playerStatus.playing) {
      player.pause();
      return;
    }
    player.seekTo(0);
    player.play();
  }, [player, playerStatus.playing]);

  const recording = recorderState.isRecording;
  const elapsed = recording ? recorderState.durationMillis : takeMillis;

  return (
    <View style={styles.control}>
      <View style={styles.row}>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={disabled || busy}
          onPress={() => void (recording ? stop() : start())}
          style={[
            styles.button,
            styles.grow,
            {
              borderColor: recording ? colors.error : colors.border,
              backgroundColor: colors.inputBg,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={{ color: recording ? colors.error : colors.primary }}>
              {recording ? "Stop recording" : takeUri ? "Record again" : "Record"}
            </Text>
          )}
        </TouchableOpacity>
        {takeUri && !recording ? (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={disabled || busy}
            onPress={togglePlayback}
            style={[
              styles.button,
              { borderColor: colors.border, backgroundColor: colors.inputBg },
            ]}
          >
            <Text style={{ color: colors.primary }}>
              {playerStatus.playing ? "Pause" : "Play"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {recording || elapsed > 0 ? (
        <Text style={[styles.meta, { color: recording ? colors.error : colors.textTertiary }]}>
          {recording ? `Recording ${formatDuration(elapsed)}` : `Take ${formatDuration(elapsed)}`}
        </Text>
      ) : null}
      {notice ? (
        <Text style={[styles.meta, { color: colors.error }]}>{notice}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  control: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  grow: {
    flex: 1,
  },
  button: {
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  meta: {
    fontSize: 12,
  },
});
