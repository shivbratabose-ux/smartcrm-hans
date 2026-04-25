import React, { useMemo, useState } from 'react';
import {
  View, Text, FlatList, TextInput, StyleSheet, RefreshControl, Pressable,
} from 'react-native';
import { Search, Plus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radii, fontSize } from '@/theme';
import { LeadRow } from '@/components/LeadRow';
import { useLeads, type Lead } from '@/hooks/useLeads';

type Props = {
  onOpen: (id: string) => void;
  onNew: () => void;
};

export function LeadsScreen({ onOpen, onNew }: Props) {
  const { data, isLoading, refetch, isRefetching, error } = useLeads();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const list = data || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(l =>
      (l.company || '').toLowerCase().includes(q) ||
      (l.contact_name || l.contact || '').toLowerCase().includes(q) ||
      (l.email || '').toLowerCase().includes(q) ||
      (l.phone || '').toLowerCase().includes(q) ||
      (l.lead_id || '').toLowerCase().includes(q)
    );
  }, [data, query]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Leads</Text>
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
          placeholder="Search company, contact, email, phone…"
          placeholderTextColor={colors.text3}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Couldn't load leads.{'\n'}{(error as Error).message}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(l: Lead) => l.id}
          renderItem={({ item }) => <LeadRow lead={item} onPress={() => onOpen(item.id)}/>}
          ItemSeparatorComponent={null}
          refreshControl={<RefreshControl refreshing={!!isRefetching} onRefresh={refetch} tintColor={colors.brand}/>}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {isLoading ? 'Loading…' : query ? `No leads match "${query}"` : 'No leads yet. Tap New to add one.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
  },
  newBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '600' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
  },
  empty: {
    padding: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.text3,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});
