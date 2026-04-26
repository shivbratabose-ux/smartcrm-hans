// SeverityChip — small pill that conveys urgency / status semantically.
// Pulls colors from theme.severity so the same "overdue" looks identical
// on Today, on Plan, and on a Lead row.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { severity, type Severity, fontSize, fontWeight, radii, spacing } from '@/theme';

type Props = {
  level: Severity;
  label?: string;            // override the default label ("Overdue" etc.)
};

export function SeverityChip({ level, label }: Props) {
  const t = severity[level];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      <Text style={[styles.text, { color: t.fg }]}>{label ?? t.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  text: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
