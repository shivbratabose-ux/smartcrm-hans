// SectionHeader — title + optional right-side action above a list section.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, fontSize, fontWeight, spacing } from '@/theme';

type Props = {
  title: string;
  count?: number;
  action?: { label: string; onPress: () => void };
};

export function SectionHeader({ title, count, action }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>
        {title}
        {typeof count === 'number' ? <Text style={styles.count}>  {count}</Text> : null}
      </Text>
      {action ? (
        <Pressable hitSlop={8} onPress={action.onPress}>
          <Text style={styles.action}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.text3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  count: { color: colors.text2, fontWeight: fontWeight.regular },
  action: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semi,
    color: colors.brand,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
