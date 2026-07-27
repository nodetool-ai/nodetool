/**
 * A touch-draggable slider. React Native ships no slider and the app has no
 * slider dependency, so the app builder's Slider widget draws its own: a track
 * the user drags, reporting live changes while moving and a commit on release
 * (which is what `pace: "release"` keys on).
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  View,
} from "react-native";

import { useTheme } from "../../hooks/useTheme";

interface SliderControlProps {
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}

const THUMB = 24;

export const SliderControl: React.FC<SliderControlProps> = ({
  value,
  min,
  max,
  step,
  disabled = false,
  onChange,
  onCommit,
}) => {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const latestRef = useRef(value);
  latestRef.current = value;

  const span = max - min || 1;

  const quantize = useCallback(
    (raw: number): number => {
      const clamped = Math.min(Math.max(raw, min), max);
      if (step <= 0) {return clamped;}
      const snapped = min + Math.round((clamped - min) / step) * step;
      // Re-clamp: the last step can overshoot when the range is not a whole
      // multiple of the step.
      const bounded = Math.min(Math.max(snapped, min), max);
      // Kill float drift from the division above (0.30000000000000004).
      return Number(bounded.toFixed(6));
    },
    [max, min, step]
  );

  const valueAt = useCallback(
    (x: number): number => {
      const track = widthRef.current - THUMB;
      if (track <= 0) {return min;}
      const ratio = Math.min(Math.max((x - THUMB / 2) / track, 0), 1);
      return quantize(min + ratio * span);
    },
    [min, quantize, span]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (event) => {
          const next = valueAt(event.nativeEvent.locationX);
          latestRef.current = next;
          onChange(next);
        },
        onPanResponderMove: (event) => {
          const next = valueAt(event.nativeEvent.locationX);
          if (next === latestRef.current) {return;}
          latestRef.current = next;
          onChange(next);
        },
        onPanResponderRelease: () => onCommit(latestRef.current),
        onPanResponderTerminate: () => onCommit(latestRef.current),
      }),
    [disabled, onChange, onCommit, valueAt]
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    widthRef.current = event.nativeEvent.layout.width;
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const ratio = Math.min(Math.max((value - min) / span, 0), 1);
  const filled = Math.max(0, (width - THUMB) * ratio);

  return (
    <View
      style={styles.container}
      onLayout={onLayout}
      testID="slider-control"
      accessibilityRole="adjustable"
      accessibilityValue={{ min, max, now: value }}
      {...panResponder.panHandlers}
    >
      <View style={[styles.track, { backgroundColor: colors.border }]} />
      <View
        style={[
          styles.track,
          styles.fill,
          { width: filled + THUMB / 2, backgroundColor: colors.primary },
        ]}
      />
      <View
        style={[
          styles.thumb,
          {
            left: filled,
            backgroundColor: colors.primary,
            borderColor: colors.background,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 40,
    justifyContent: "center",
  },
  track: {
    height: 4,
    borderRadius: 2,
    marginHorizontal: THUMB / 2,
  },
  fill: {
    position: "absolute",
    left: 0,
    marginHorizontal: 0,
  },
  thumb: {
    position: "absolute",
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 2,
  },
});
