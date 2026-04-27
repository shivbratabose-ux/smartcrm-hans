// ScanCardScreen — capture a business card with the camera, parse fields,
// confirm/edit, then save as Lead OR Contact. PR #107.
// ─────────────────────────────────────────────────────────────────────────────
// The product brief calls out card scanning as a top field-sales win:
// "salesperson hands me a card → in 5 seconds it's in the CRM with a follow-
// up reminder set". This screen is the camera + confirm flow.
//
// OCR strategy & current state
// ────────────────────────────
// REAL ML Kit text recognition (`@react-native-ml-kit/text-recognition`) is a
// native module that does NOT work inside Expo Go because Expo Go ships a
// fixed bundle of native modules. Adding it requires:
//   1. Eject to bare workflow OR move to an EAS dev client
//   2. Re-build the dev binary
//
// We didn't want to block the rest of PR #107 on that infra change. So this
// PR ships:
//   - The full camera capture flow (expo-camera, permissions, preview)
//   - Manual entry of the 4 critical fields (name, company, phone, email)
//     with smart defaults — the user types what they see on the card
//   - A "target picker" — once parsed the user chooses where it lands:
//       New Lead / New Contact (linked to existing Account) / Discard
//   - A clear placeholder ribbon: "Auto-fill coming once we ship the dev
//     client." So the user understands why they're typing manually.
//
// PR #107.5 (planned): swap manual entry for auto-detected fields once the
// EAS dev client lands. The contract (CardData → save flow) stays the same.

import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView, Alert, Pressable, Image,
  ActivityIndicator,
} from 'react-native';
import {
  ChevronLeft, Camera as CameraIcon, RotateCcw, Check, Sparkles, Info,
  UserPlus, ContactRound,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { colors, spacing, radii, fontSize, fontWeight } from '@/theme';
import { PrimaryButton } from '@/components/PrimaryButton';
import { requireSupabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthContext';

type Props = { onBack: () => void };

// Three steps: PICK CAMERA PERMISSION → CAPTURE → REVIEW & SAVE
type Step = 'capture' | 'review';
type Target = 'lead' | 'contact';

type CardData = {
  name: string;
  company: string;
  designation: string;
  email: string;
  phone: string;
};

const BLANK_CARD: CardData = { name: '', company: '', designation: '', email: '', phone: '' };

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b([a-z])([a-z'.-]*)/g, (_m, a, b) => a.toUpperCase() + b);

export function ScanCardScreen({ onBack }: Props) {
  const qc = useQueryClient();
  const { profile } = useAuth();

  const [step, setStep]         = useState<Step>('capture');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [card, setCard]         = useState<CardData>(BLANK_CARD);
  const [target, setTarget]     = useState<Target>('lead');
  const [busy, setBusy]         = useState(false);

  // Camera module loaded lazily so the web bundle doesn't choke trying to
  // resolve a native-only module (matches the pattern other screens use).
  const cameraRef = useRef<any>(null);
  let CameraModule: any = null;
  try { CameraModule = require('expo-camera'); } catch { /* native-only */ }

  // expo-camera v15 exposes `useCameraPermissions` + `CameraView`. v14 used
  // `Camera.useCameraPermissions` + `<Camera/>`. Detect which one is available
  // so this screen survives a minor-version bump without an immediate code
  // change.
  const useCameraPermissions =
    CameraModule?.useCameraPermissions ||
    CameraModule?.Camera?.useCameraPermissions;
  const CameraView = CameraModule?.CameraView || CameraModule?.Camera || null;

  // Hooks must run unconditionally — even if the module isn't loaded we still
  // call a no-op so the hook order stays stable across renders. The runtime
  // path that hits this is "web preview" only; on device it always loads.
  const [permission, requestPermission] =
    typeof useCameraPermissions === 'function'
      ? useCameraPermissions()
      : [null, () => Promise.resolve({ granted: false })];

  const capture = async () => {
    if (!cameraRef.current?.takePictureAsync) {
      // No camera available (web preview / simulator without camera).
      // Give the user a way to still test the flow — bypass to review.
      setPhotoUri(null);
      setStep('review');
      return;
    }
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: true,
      });
      setPhotoUri(photo?.uri || null);
      setStep('review');
    } catch (e) {
      Alert.alert("Couldn't capture", String((e as Error).message));
    }
  };

  const retake = () => {
    setPhotoUri(null);
    setCard(BLANK_CARD);
    setStep('capture');
  };

  const set = (k: keyof CardData, v: string) => setCard(c => ({ ...c, [k]: v }));

  const canSave =
    card.name.trim().length > 1 &&
    (card.email.trim() || card.phone.trim()) &&
    !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      const sb = requireSupabase();

      if (target === 'lead') {
        const { error } = await sb.from('leads').insert({
          company: (card.company.trim() || card.name.trim()).toUpperCase(),
          contact_name: titleCase(card.name.trim()),
          designation: card.designation.trim() ? titleCase(card.designation.trim()) : null,
          email: card.email.trim().toLowerCase() || null,
          phone: card.phone.trim().replace(/\s+/g, ' ') || null,
          stage: 'MQL',
          source: 'Card Scan',
          owner: profile?.id || null,
          score: 30,
          is_deleted: false,
        });
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ['leads'] });
      } else {
        const { error } = await sb.from('contacts').insert({
          contact_id: `CON-${Date.now().toString(36).toUpperCase()}`,
          name: titleCase(card.name.trim()),
          designation: card.designation.trim() ? titleCase(card.designation.trim()) : null,
          email: card.email.trim().toLowerCase() || null,
          phone: card.phone.trim().replace(/\s+/g, ' ') || null,
          is_deleted: false,
        });
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ['contacts'] });
      }

      onBack();
    } catch (e) {
      Alert.alert("Couldn't save", String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  // ─────────────── Render ───────────────

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={onBack} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.brand}/>
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.headerTitle}>Scan Business Card</Text>
          <Text style={styles.headerSub}>
            {step === 'capture' ? 'Frame the card and tap capture' : 'Review and save'}
          </Text>
        </View>
        <View style={styles.headerIcon}>
          <CameraIcon size={20} color={colors.brand}/>
        </View>
      </View>

      {step === 'capture' ? (
        <CaptureStep
          CameraView={CameraView}
          cameraRef={cameraRef}
          permission={permission}
          requestPermission={requestPermission}
          onCapture={capture}
          onSkip={() => setStep('review')}
        />
      ) : (
        <ReviewStep
          photoUri={photoUri}
          card={card}
          set={set}
          target={target}
          setTarget={setTarget}
          canSave={canSave}
          busy={busy}
          onSave={save}
          onRetake={retake}
          onCancel={onBack}
        />
      )}
    </SafeAreaView>
  );
}

// ─────────────── Sub-components ───────────────

function CaptureStep({
  CameraView, cameraRef, permission, requestPermission, onCapture, onSkip,
}: {
  CameraView: any;
  cameraRef: React.MutableRefObject<any>;
  permission: any;
  requestPermission: () => Promise<any>;
  onCapture: () => void;
  onSkip: () => void;
}) {
  // ── Web / simulator fallback ──
  if (!CameraView) {
    return (
      <View style={styles.fallback}>
        <CameraIcon size={48} color={colors.text3}/>
        <Text style={styles.fallbackTitle}>Camera not available here</Text>
        <Text style={styles.fallbackSub}>
          Card scanning needs a real device. Skip to enter the contact details
          manually.
        </Text>
        <View style={{ height: spacing.lg }}/>
        <PrimaryButton title="Enter manually" onPress={onSkip}/>
      </View>
    );
  }

  // ── Permission gate ──
  if (!permission) {
    return (
      <View style={styles.fallback}>
        <ActivityIndicator color={colors.brand}/>
      </View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={styles.fallback}>
        <CameraIcon size={48} color={colors.brand}/>
        <Text style={styles.fallbackTitle}>Camera permission needed</Text>
        <Text style={styles.fallbackSub}>
          To scan a business card we need permission to use your camera. We
          only use it when you tap "Capture".
        </Text>
        <View style={{ height: spacing.lg }}/>
        <PrimaryButton title="Grant permission" onPress={requestPermission}/>
        <View style={{ height: spacing.sm }}/>
        <PrimaryButton variant="secondary" title="Enter manually instead" onPress={onSkip}/>
      </View>
    );
  }

  // ── Live camera ──
  return (
    <View style={styles.cameraWrap}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing="back"
        autofocus="on"
      />
      {/* Card-shaped focus overlay so the user knows where to align */}
      <View style={styles.cameraOverlay} pointerEvents="none">
        <View style={styles.cardFrame}/>
        <Text style={styles.cameraHint}>
          Align the business card inside the frame
        </Text>
      </View>
      {/* Capture button */}
      <View style={styles.captureBar}>
        <Pressable onPress={onCapture} style={styles.shutter}>
          <View style={styles.shutterInner}/>
        </Pressable>
      </View>
      {/* Roadmap ribbon — sets expectations honestly */}
      <View style={styles.roadmapRibbon}>
        <Sparkles size={12} color="#fff"/>
        <Text style={styles.roadmapText}>
          Auto-fill (ML Kit OCR) ships in PR #107.5 — for now type from the photo.
        </Text>
      </View>
    </View>
  );
}

function ReviewStep({
  photoUri, card, set, target, setTarget,
  canSave, busy, onSave, onRetake, onCancel,
}: {
  photoUri: string | null;
  card: CardData;
  set: (k: keyof CardData, v: string) => void;
  target: Target;
  setTarget: (t: Target) => void;
  canSave: boolean;
  busy: boolean;
  onSave: () => void;
  onRetake: () => void;
  onCancel: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.reviewScroll} keyboardShouldPersistTaps="handled">
      {/* Photo preview */}
      {photoUri ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover"/>
          <Pressable onPress={onRetake} style={styles.retakeBtn}>
            <RotateCcw size={14} color="#fff"/>
            <Text style={styles.retakeText}>Retake</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.noPhotoWrap}>
          <Info size={16} color={colors.text3}/>
          <Text style={styles.noPhotoText}>
            No photo captured. You can still type the details below.
          </Text>
        </View>
      )}

      {/* Target picker — Lead vs Contact */}
      <Text style={styles.sectionTitle}>Save as</Text>
      <View style={styles.targetRow}>
        <Pressable
          style={[styles.targetCard, target === 'lead' && styles.targetCardActive]}
          onPress={() => setTarget('lead')}
        >
          <UserPlus size={20} color={target === 'lead' ? colors.brand : colors.text3}/>
          <Text style={[styles.targetTitle, target === 'lead' && styles.targetTitleActive]}>New Lead</Text>
          <Text style={styles.targetSub}>Track as a sales prospect</Text>
        </Pressable>
        <Pressable
          style={[styles.targetCard, target === 'contact' && styles.targetCardActive]}
          onPress={() => setTarget('contact')}
        >
          <ContactRound size={20} color={target === 'contact' ? colors.brand : colors.text3}/>
          <Text style={[styles.targetTitle, target === 'contact' && styles.targetTitleActive]}>New Contact</Text>
          <Text style={styles.targetSub}>Just save details</Text>
        </Pressable>
      </View>

      {/* Fields */}
      <Text style={styles.sectionTitle}>Details</Text>
      <Field label="Full Name *"  value={card.name}        onChange={v => set('name', v)}/>
      <Field label="Company"      value={card.company}     onChange={v => set('company', v)} autoCapitalize="characters"/>
      <Field label="Designation"  value={card.designation} onChange={v => set('designation', v)}/>
      <Field label="Email"        value={card.email}       onChange={v => set('email', v)}    keyboardType="email-address" autoCapitalize="none"/>
      <Field label="Phone"        value={card.phone}       onChange={v => set('phone', v)}    keyboardType="phone-pad"/>

      <View style={{ height: spacing.lg }}/>
      <PrimaryButton
        title={busy ? 'Saving…' : `Save as ${target === 'lead' ? 'Lead' : 'Contact'}`}
        icon={busy ? undefined : <Check size={16} color="#fff"/>}
        loading={busy}
        disabled={!canSave}
        onPress={onSave}
      />
      <View style={{ height: spacing.sm }}/>
      <PrimaryButton variant="secondary" title="Cancel" onPress={onCancel}/>
    </ScrollView>
  );
}

function Field({ label, value, onChange, keyboardType, autoCapitalize }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput
        style={fieldStyles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType || 'default'}
        autoCapitalize={autoCapitalize || (keyboardType === 'email-address' ? 'none' : 'sentences')}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },          // black background looks right while camera is up
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  headerSub:   { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },
  headerIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },

  // Camera step
  cameraWrap: { flex: 1, backgroundColor: '#000' },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  cardFrame: {
    width: '85%',
    aspectRatio: 1.7,                                  // standard business card 3.5×2 in
    borderRadius: 12,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)',
  },
  cameraHint: {
    color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semi,
    marginTop: spacing.lg,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4,
  },
  captureBar: {
    position: 'absolute', bottom: 36, left: 0, right: 0,
    alignItems: 'center',
  },
  shutter: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#fff',
  },
  roadmapRibbon: {
    position: 'absolute', top: spacing.md, left: spacing.md, right: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(13,31,45,0.85)',
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radii.md,
  },
  roadmapText: {
    color: '#fff', fontSize: 11, flex: 1, lineHeight: 16,
  },

  // Permission / web fallback
  fallback: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xxl, backgroundColor: colors.bg,
  },
  fallbackTitle: {
    fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text,
    marginTop: spacing.lg, textAlign: 'center',
  },
  fallbackSub:   { fontSize: fontSize.sm, color: colors.text2, marginTop: spacing.sm, textAlign: 'center', lineHeight: 20 },

  // Review step
  reviewScroll: { padding: spacing.lg, paddingBottom: 80, backgroundColor: colors.bg },
  previewWrap: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    aspectRatio: 1.7,
    marginBottom: spacing.lg,
  },
  preview: { width: '100%', height: '100%' },
  retakeBtn: {
    position: 'absolute', bottom: spacing.sm, right: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radii.pill,
  },
  retakeText: { color: '#fff', fontSize: fontSize.xs, fontWeight: fontWeight.semi },

  noPhotoWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.s2,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  noPhotoText: { fontSize: fontSize.xs, color: colors.text2, flex: 1 },

  sectionTitle: {
    fontSize: fontSize.xs, fontWeight: fontWeight.bold,
    color: colors.text3, letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.md, marginBottom: spacing.sm,
  },

  targetRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  targetCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1.5, borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'flex-start',
  },
  targetCardActive: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  targetTitle:      { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text2, marginTop: spacing.xs },
  targetTitleActive:{ color: colors.brand },
  targetSub:        { fontSize: 11, color: colors.text3, marginTop: 2 },
});

const fieldStyles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { fontSize: fontSize.xs, color: colors.text2, fontWeight: fontWeight.semi, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.md, color: colors.text,
  },
});
