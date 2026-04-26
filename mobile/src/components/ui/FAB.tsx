// FAB — Floating Action Button + bottom-sheet action menu.
// ─────────────────────────────────────────────────────────────────────────────
// One global FAB on every tab. Tap it → modal scrim + bottom sheet with
// 4 actions (Scan Card / Log Call / New Lead / Schedule Meeting).
// The sheet's contents are CONTEXT-AWARE: each tab can supply its own
// shortcut list via `actions` prop on FABContext.
//
// Why a separate component (vs. expo-router-style global Modal)?
// React Navigation v6 lets us mount the FAB once at the root, hovering
// above all tabs. The bottom sheet uses Modal with a fade animation —
// no extra dependency, plays nicely with native back button.

import React, { createContext, useCallback, useContext, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, Dimensions,
} from 'react-native';
import { Plus, X } from 'lucide-react-native';
import { colors, fontSize, fontWeight, spacing, radii, elevation } from '@/theme';

export type FABAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  hint?: string;
};

type FABContextValue = {
  actions: FABAction[];
  setActions: (actions: FABAction[]) => void;
};

const FABContext = createContext<FABContextValue | null>(null);

/** Wrap your app once in <FABProvider>; each screen calls useFAB() to publish its actions. */
export function FABProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActions] = useState<FABAction[]>([]);
  return (
    <FABContext.Provider value={{ actions, setActions }}>
      {children}
    </FABContext.Provider>
  );
}

/** Screen-level hook to register the FAB actions for the current tab. */
export function useFAB(actions: FABAction[]) {
  const ctx = useContext(FABContext);
  React.useEffect(() => {
    if (ctx) ctx.setActions(actions);
    // Note: deliberately stringify to compare; otherwise re-runs every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(actions.map(a => a.key))]);
}

/** The visible button + sheet. Mount once at the root, above the tab bar. */
export function FAB({ bottomOffset = 70 }: { bottomOffset?: number }) {
  const ctx = useContext(FABContext);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // Hide the FAB if no screen has registered actions yet (avoids a stray
  // button on the Login screen, modals, etc.)
  if (!ctx || ctx.actions.length === 0) return null;

  return (
    <>
      <View pointerEvents="box-none" style={[styles.fabWrap, { bottom: bottomOffset }]}>
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          android_ripple={{ color: 'rgba(255,255,255,0.18)', radius: 28, borderless: true }}
          onPress={() => setOpen(true)}
          hitSlop={8}
          accessibilityLabel="Quick actions"
        >
          <Plus size={26} color={colors.textInv}/>
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <Pressable style={styles.scrim} onPress={close}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle}/>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Quick action</Text>
              <Pressable hitSlop={12} onPress={close}>
                <X size={20} color={colors.text3}/>
              </Pressable>
            </View>
            <View style={styles.actions}>
              {ctx.actions.map(a => (
                <Pressable
                  key={a.key}
                  style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
                  android_ripple={{ color: colors.s3 }}
                  onPress={() => { close(); a.onPress(); }}
                >
                  <View style={styles.actionIcon}>{a.icon}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionLabel}>{a.label}</Text>
                    {a.hint ? <Text style={styles.actionHint}>{a.hint}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const SCREEN = Dimensions.get('window');

const styles = StyleSheet.create({
  fabWrap: { position: 'absolute', right: spacing.xl, alignItems: 'flex-end' },
  fab: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
    ...elevation.xl,
  },
  fabPressed: { opacity: 0.92 },

  scrim: {
    flex: 1,
    backgroundColor: 'rgba(13,31,45,0.42)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl + 8,
    minHeight: 280,
    width: SCREEN.width,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40, height: 5, borderRadius: 4,
    backgroundColor: colors.border2,
    marginBottom: spacing.sm,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  actions: { gap: spacing.xs },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  actionPressed: { backgroundColor: colors.s2 },
  actionIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semi, color: colors.text },
  actionHint:  { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
});
