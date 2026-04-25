import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, radii, fontSize } from '@/theme';

type Props = {
  label: string;
  value: number | string;
  sub?: string;
  tint?: keyof typeof TINTS;
  onPress?: () => void;
};

const TINTS = {
  brand:  { fg: colors.brand,  bg: colors.brandLight },
  blue:   { fg: colors.blue,   bg: colors.blueBg     },
  amber:  { fg: colors.amber,  bg: colors.amberBg    },
  green:  { fg: colors.green,  bg: colors.greenBg    },
  red:    { fg: colors.red,    bg: colors.redBg      },
} as const;

export function KpiCard({ label, value, sub, tint = 'brand', onPress }: Props) {
  const t = TINTS[tint];
  const Wrap: React.ComponentType<any> = onPress ? Pressable : View;
  return (
    <Wrap style={[styles.card, { backgroundColor: t.bg }]} onPress={onPress}>
      <Text style={[styles.label, { color: t.fg }]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.value, { color: t.fg }]} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={styles.sub} numberOfLines={1}>{sub}</Text> : null}
    </Wrap>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '47%',
    borderRadius: radii.lg,
    padding: spacing.lg,
    minHeight: 96,
    justifyContent: 'space-between',
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  sub: {
    fontSize: fontSize.xs,
    color: colors.text3,
    marginTop: 2,
  },
});
