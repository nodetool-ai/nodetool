/**
 * Loading indicator with 3-dot typing animation.
 * Shown while waiting for AI response.
 */

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

interface LoadingIndicatorProps {
  size?: number;
  color?: string;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  size = 8,
  color,
}) => {
  const { colors } = useTheme();
  const dotColor = color || colors.textSecondary;

  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createDotAnimation = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(600 - delay),
        ])
      );

    const anim1 = createDotAnimation(dot1, 0);
    const anim2 = createDotAnimation(dot2, 150);
    const anim3 = createDotAnimation(dot3, 300);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dot1, dot2, dot3]);

  const renderDot = (anim: Animated.Value) => (
    <Animated.View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: dotColor,
          opacity: Animated.add(0.3, Animated.multiply(anim, 0.7)),
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -4],
              }),
            },
          ],
        },
      ]}
    />
  );

  return (
    <View style={styles.container} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {renderDot(dot1)}
      {renderDot(dot2)}
      {renderDot(dot3)}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  dot: {
    marginHorizontal: 2,
  },
});

export default LoadingIndicator;
