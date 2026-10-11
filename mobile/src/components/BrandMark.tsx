/**
 * The NodeTool mark: the gradient logo from the splash screen, cropped to its
 * edges and transparent, so it sits on either theme. Used where the app
 * introduces itself (splash, sign-in, a new chat) instead of a stock glyph.
 */
import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

interface BrandMarkProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

export function BrandMark({ size = 56, style }: BrandMarkProps) {
  return (
    <Image
      source={require('../../assets/brand-mark.png')}
      style={[styles.mark, { width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="NodeTool"
    />
  );
}

const styles = StyleSheet.create({
  mark: {
    alignSelf: 'center',
  },
});

export default BrandMark;
