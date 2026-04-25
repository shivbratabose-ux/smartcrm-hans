import React, { useMemo, useState } from 'react';
import {
  View, Text, FlatList, TextInput, StyleSheet, RefreshControl, Pressable,
} from 'react-native';
import { Search, Plus, Phone, Mail, MessageSquare } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radii, fontSize } from '@/theme';
import { useContacts, type Contact } from '@/hooks/useContacts';
import { callPhone, openWhatsApp, openEmail } from '@/utils/dial';
import { initials } from '@/utils/format';

type Props = { onNew: () => void };

export function ContactsScreen({ onNew }: Props) {
  const { data, isLoading, refetch, isRefetching } = useContacts();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const list = data || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.designation || '').toLowerCase().includes(q)
    );
  }, [data, query]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Contacts</Text>
        <Pressable style={styles.newBtn} onPress={onNew}>
          <Plus size={18} color="#fff"/>
          <Text style={styles.newBtnText}>New</Text>
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Search size={16} color={colors.text3}/>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, email, phone…"
          placeholderTextColor={colors.text3}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(c: Contact) => c.id}
        renderItem={({ item }) => <ContactRow contact={item}/>}
        refreshControl={<RefreshControl refreshing={!!isRefetching} onRefresh={refetch} tintColor={colors.brand}/>}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {isLoading ? 'Loading…' : query ? `No contacts match "${query}"` : 'No contacts yet. Tap New to add one.'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function ContactRow({ contact }: { contact: Contact }) {
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(contact.name)}</Text>
      </View>
      <View style={styles.left}>
        <Text style={styles.name} numberOfLines={1}>{contact.name}</Text>
        {contact.designation ? (
          <Text style={styles.sub} numberOfLines={1}>{contact.designation}</Text>
        ) : null}
        {contact.email ? (
          <Text style={styles.email} numberOfLines={1}>{contact.email}</Text>
        ) : null}
      </View>
      <View style={styles.right}>
        {contact.phone ? (
          <>
            <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => callPhone(contact.phone || '')}>
              <Phone size={16} color={colors.brand}/>
            </Pressable>
            <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => openWhatsApp(contact.phone || '', `Hi ${contact.name}`)}>
              <MessageSquare size={16} color={colors.brand}/>
            </Pressable>
          </>
        ) : null}
        {contact.email ? (
          <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => openEmail(contact.email || '', '', '')}>
            <Mail size={16} color={colors.brand}/>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radii.md,
  },
  newBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '600' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    paddingHorizontal: spacing.md, height: 44,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: fontSize.md },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    gap: spacing.md,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
  left: { flex: 1, minWidth: 0 },
  right: { flexDirection: 'row', gap: spacing.sm },
  name: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  sub: { fontSize: fontSize.xs, color: colors.text2, marginTop: 2 },
  email: { fontSize: fontSize.xs, color: colors.text3, marginTop: 2 },

  iconBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.brandLight,
    alignItems: 'center', justifyContent: 'center',
  },

  empty: { padding: spacing.xxl, alignItems: 'center' },
  emptyText: { color: colors.text3, fontSize: fontSize.sm, textAlign: 'center' },
});
