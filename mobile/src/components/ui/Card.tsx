// Card — the core surface used everywhere lists / sections appear.
// Press-feedback opacity-dim if `onPress` is provided. Pass `flat` to drop
// the elevation when the card sits inside a section that already has its
// own background (avoids double-shadow on nested layouts).
import React from 'react';
import { Pressable, View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, radii, spacing, elevation } from '@/theme';

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  flat?: boolean;
  padding?: keyof typeof PADDING;
};

const PADDING = {
  none: 0,
  sm: spacing.md,
  md: spacing.lg,
  lg: spacing.xl,
} as const;

export function Card({ children, onPress, style, flat = false, padding = 'md' }: Props) {
  const Wrap: React.ComponentType<any> = onPress ? Pressable : View;
  const props = onPress ? { onPress, android_ripple: { color: colors.s3 } } : {};
  return (
    <Wrap
      {...props}
      style={({ pressed }: any) => [
        styles.base,
        { padding: PADDING[padding] },
        !flat && elevation.sm,
        onPress && pressed && styles.pressed,
        style,
      ]}
    >
      {children}
    </Wrap>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.85 },
});
