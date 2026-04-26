// BottomSheet — reusable modal sheet pattern, mirroring the FAB sheet.
// ─────────────────────────────────────────────────────────────────────────────
// Used by:
//   - PlanRowSheet (tap a Plan row → details + comment composer)
//   - RowActionSheet (long-press → Reschedule / Mark Done / Delete actions)
//
// Built on RN's <Modal/> with a transparent scrim + slide-up content panel.
// We deliberately skip third-party sheet libs (e.g. @gorhom/bottom-sheet)
// to keep the dep surface small — the interactions we need are basic.
//
// Props:
//   visible    — open/closed
//   onClose    — close handler (scrim tap, X button, hardware back)
//   title      — sheet header text
//   children   — body content
//   maxHeightPct — cap as fraction of screen height (default 0.85)
import React from 'react';
import {
  Modal, View, Text, Pressable, StyleSheet, Dimensions, ScrollView,
} from 'react-native';
import { X } from 'lucide-react-native';
import { colors, fontSize, fontWeight, spacing, radii } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  maxHeightPct?: number;
  scrollable?: boolean;
};

export function BottomSheet({
  visible, onClose, title, subtitle, children,
  maxHeightPct = 0.85,
  scrollable = true,
}: Props) {
  const screenH = Dimensions.get('window').height;
  const maxHeight = screenH * maxHeightPct;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={[styles.sheet, { maxHeight }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle}/>
          {(title || onClose) && (
            <View style={styles.head}>
              <View style={{ flex: 1, minWidth: 0 }}>
                {title    ? <Text style={styles.title}    numberOfLines={1}>{title}</Text>    : null}
                {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
              </View>
              <Pressable hitSlop={12} onPress={onClose} style={styles.closeBtn}>
                <X size={20} color={colors.text3}/>
              </Pressable>
            </View>
          )}
          {scrollable
            ? <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">{children}</ScrollView>
            : <View style={styles.body}>{children}</View>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(13,31,45,0.42)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40, height: 5, borderRadius: 4,
    backgroundColor: colors.border2,
    marginBottom: spacing.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  title:    { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  subtitle: { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  body: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl + 8,
  },
});
