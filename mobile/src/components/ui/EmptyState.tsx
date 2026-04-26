// EmptyState — shown whenever a list is empty.
// "Loading…" text in the previous version was lazy. This gives the user
// (a) a visual cue that the screen rendered, (b) the icon for context,
// and (c) a clear next action.
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, fontSize, fontWeight, spacing, radii } from '@/theme';

type Props = {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  cta?: { label: string; onPress: () => void };
};

export function EmptyState({ icon, title, sub, cta }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.iconBubble}>{icon}</View>
      <Text style={styles.title}>{title}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      {cta ? (
        <Pressable style={styles.cta} onPress={cta.onPress}>
          <Text style={styles.ctaText}>{cta.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  iconBubble: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  sub: {
    fontSize: fontSize.sm,
    color: colors.text3,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 20,
    maxWidth: 320,
  },
  cta: {
    marginTop: spacing.lg,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
    borderRadius: radii.md,
  },
  ctaText: { color: colors.textInv, fontSize: fontSize.sm, fontWeight: fontWeight.semi },
});
