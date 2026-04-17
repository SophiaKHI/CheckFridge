import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

interface HistoryEntry {
  name: string;
  icon: string;
  count: number;
}

type Status = 'used' | 'trashed';

async function loadHistory(status: Status): Promise<HistoryEntry[]> {
  const { data, error } = await supabase
    .from('fridge_items')
    .select('name, icon')
    .eq('status', status);

  if (error || !data) return [];

  const grouped: Record<string, HistoryEntry> = {};
  for (const item of data) {
    const key = item.name.toLowerCase().trim();
    if (!grouped[key]) grouped[key] = { name: item.name, icon: item.icon, count: 0 };
    grouped[key].count++;
  }
  return Object.values(grouped).sort((a, b) => b.count - a.count);
}

export default function HistoryScreen({ route }: any) {
  const [tab, setTab] = useState<Status>('used');
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async (status: Status) => {
    setLoading(true);
    setEntries(await loadHistory(status));
    setLoading(false);
  }, []);

  // On focus: honour initialStatus param from navigation (e.g. tapping a drop zone badge),
  // otherwise reload the current tab
  useFocusEffect(useCallback(() => {
    const initial = route.params?.initialStatus as Status | undefined;
    if (initial && initial !== tab) {
      setTab(initial);
      fetch(initial);
    } else {
      fetch(tab);
    }
  }, [route.params?.initialStatus]));

  const switchTab = (status: Status) => {
    setTab(status);
    fetch(status);
  };

  const isTrash   = tab === 'trashed';
  const accent    = isTrash ? '#E57373' : '#1D9E75';
  const emptyIcon = isTrash ? '🗑️' : '✅';

  return (
    <View style={styles.container}>
      {/* Toggle */}
      <View style={styles.toggle}>
        <TouchableOpacity
          style={[styles.toggleBtn, !isTrash && styles.toggleBtnActive]}
          onPress={() => switchTab('used')}
        >
          <Text style={[styles.toggleText, !isTrash && styles.toggleTextActive]}>✅ Used</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, isTrash && styles.toggleBtnActiveTrash]}
          onPress={() => switchTab('trashed')}
        >
          <Text style={[styles.toggleText, isTrash && styles.toggleTextActiveTrash]}>🗑️ Tossed</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        {isTrash
          ? 'What you throw away most — buy less of these.'
          : 'What you use up most — keep more in stock.'}
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color={accent} style={{ marginTop: 60 }} />
      ) : entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>{emptyIcon}</Text>
          <Text style={styles.emptyTitle}>No history yet</Text>
          <Text style={styles.emptySubtitle}>
            {isTrash
              ? 'Drag items to the 🗑️ zone to track what you waste.'
              : 'Drag items to the ✅ zone to track what you eat.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item, index }) => (
            <View style={styles.row}>
              <Text style={styles.rank}>#{index + 1}</Text>
              <Text style={styles.rowIcon}>{item.icon}</Text>
              <Text style={styles.rowName}>{item.name}</Text>
              <View style={[styles.countBadge, { backgroundColor: isTrash ? '#FDECEA' : '#F0FDF9' }]}>
                <Text style={[styles.countText, { color: accent }]}>{item.count}×</Text>
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  toggle: {
    flexDirection: 'row', margin: 16, marginBottom: 0,
    backgroundColor: '#f5f5f5', borderRadius: 12, padding: 4,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  toggleBtnActiveTrash: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  toggleText: { fontSize: 14, color: '#aaa', fontWeight: '500' },
  toggleTextActive: { color: '#1D9E75', fontWeight: '600' },
  toggleTextActiveTrash: { color: '#E57373', fontWeight: '600' },
  subtitle: {
    fontSize: 12, color: '#bbb', lineHeight: 17,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#555', marginBottom: 8 },
  emptySubtitle: { fontSize: 13, color: '#aaa', textAlign: 'center', lineHeight: 19 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 20, gap: 10,
  },
  rank: { fontSize: 12, color: '#ccc', width: 28, textAlign: 'right' },
  rowIcon: { fontSize: 24, width: 36, textAlign: 'center' },
  rowName: { flex: 1, fontSize: 15, color: '#111' },
  countBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  countText: { fontSize: 13, fontWeight: '600' },
  separator: { height: 0.5, backgroundColor: '#f0f0f0', marginLeft: 94 },
});
