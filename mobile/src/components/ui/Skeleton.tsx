// Skeleton — placeholder shimmer block shown while data is loading.
// ─────────────────────────────────────────────────────────────────────────────
// Using react-native-reanimated's shared values + interpolation, no extra
// dep. Fades from #E2E9EF → #EEF2F6 → #E2E9EF on a 1.4s loop. Falls back
// to a static block if the user has reduce-motion enabled (we respect that
// rather than override the OS preference).
import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, AccessibilityInfo } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, interpolateColor,
} from 'react-native-reanimated';
import { colors, radii } from '@/theme';

type Props = {
  width?: number | `${number}%`;
  height?: number;
  style?: StyleProp<ViewStyle>;
  radius?: number;
};

export function Skeleton({ width = '100%', height = 14, style, radius }: Props) {
  const v = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = React.useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    if (!reduceMotion) {
      v.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
    }
  }, [reduceMotion, v]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(v.value, [0, 1], [colors.s3, colors.border]),
  }));

  return (
    <Animated.View
      style={[
        styles.base,
        { width: width as any, height, borderRadius: radius ?? radii.sm },
        animatedStyle,
        style,
      ]}
    />
  );
}

// Convenience — a skeleton row mimicking a list item with avatar + 2 lines.
export function SkeletonRow() {
  return (
    <View style={styles.row}>
      <Skeleton width={40} height={40} radius={20}/>
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width={'70%'} height={14}/>
        <Skeleton width={'45%'} height={12}/>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
});
