// GradientHeader — branded top strip used on every screen.
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the previous flat headers with a brand-deep → brand vertical
// gradient. The header content (greeting, subtitle, right-side actions)
// sits inside; cards on the screen below "tuck under" with negative top
// margin for the modern hero-card pattern.
import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, fontWeight, spacing, gradients } from '@/theme';

type Props = {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;       // top-right slot (avatar, settings icon)
  variant?: 'brand' | 'brandDeep';
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  bottomInset?: number;          // extra padding so cards can tuck under
  children?: React.ReactNode;    // optional content below the title row
};

export function GradientHeader({
  title, subtitle, right,
  variant = 'brand',
  style, contentStyle,
  bottomInset = 0,
  children,
}: Props) {
  const palette = gradients[variant];
  return (
    <LinearGradient
      colors={palette as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[styles.root, style]}
    >
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={[styles.content, { paddingBottom: spacing.xs + bottomInset }, contentStyle]}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              {typeof title === 'string'
                ? <Text style={styles.title} numberOfLines={1}>{title}</Text>
                : title}
              {typeof subtitle === 'string'
                ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
                : subtitle}
            </View>
            {right ? <View style={styles.right}>{right}</View> : null}
          </View>
          {children}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root:    { width: '100%' },
  safe:    {},
  content: { paddingHorizontal: spacing.lg, paddingTop: 0 },
  titleRow:{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title:   { color: colors.textInv, fontSize: fontSize.md, fontWeight: fontWeight.heavy },
  subtitle:{ color: 'rgba(255,255,255,0.72)', fontSize: 11, marginTop: 1 },
  right:   { marginLeft: spacing.sm },
});
