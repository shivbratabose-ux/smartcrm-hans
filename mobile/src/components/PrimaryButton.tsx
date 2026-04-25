import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { colors, spacing, radii, fontSize } from '@/theme';

type Props = {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
};

export function PrimaryButton({ title, onPress, loading, disabled, icon, variant = 'primary' }: Props) {
  const isOff = disabled || loading;
  const styleVar = variant === 'secondary' ? styles.secondary
                  : variant === 'danger'   ? styles.danger
                  : styles.primary;
  const textVar  = variant === 'secondary' ? styles.textSecondary
                  : styles.textPrimary;
  return (
    <Pressable
      style={[styles.btn, styleVar, isOff && styles.disabled]}
      onPress={isOff ? undefined : onPress}
    >
      {loading
        ? <ActivityIndicator color={variant === 'secondary' ? colors.brand : '#fff'} />
        : <View style={styles.inner}>
            {icon ? <View style={{ marginRight: 8 }}>{icon}</View> : null}
            <Text style={[styles.text, textVar]}>{title}</Text>
          </View>
      }
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  inner: { flexDirection: 'row', alignItems: 'center' },
  primary:   { backgroundColor: colors.brand },
  secondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  danger:    { backgroundColor: colors.red },
  disabled:  { opacity: 0.5 },
  text: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  textPrimary:   { color: '#fff' },
  textSecondary: { color: colors.brand },
});
