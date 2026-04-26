// ChipBar — horizontal scroll of pill-shaped filter chips. Used at the
// top of the Plan tab (Today / Tomorrow / This Week / Overdue).
import React from 'react';
import { ScrollView, Pressable, Text, View, StyleSheet } from 'react-native';
import { colors, fontSize, fontWeight, spacing, radii } from '@/theme';

export type ChipOption<T extends string = string> = {
  value: T;
  label: string;
  badge?: number | null;     // optional count shown after label (e.g. "3")
};

type Props<T extends string> = {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function ChipBar<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            android_ripple={{ color: colors.brandLight }}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && !active && styles.chipPressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {opt.label}
            </Text>
            {typeof opt.badge === 'number' && opt.badge > 0 ? (
              <View style={[styles.badge, active && styles.badgeActive]}>
                <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{opt.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipPressed: { backgroundColor: colors.s2 },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.semi, color: colors.text2 },
  labelActive: { color: colors.textInv },
  badge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.s3,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  badgeText:   { fontSize: 10, fontWeight: fontWeight.bold, color: colors.text2 },
  badgeTextActive: { color: colors.textInv },
});
