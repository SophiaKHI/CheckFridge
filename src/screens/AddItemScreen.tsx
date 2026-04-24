import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert,
} from 'react-native';
import { useFridgeStore } from '../store/fridgeStore';
import { supabase } from '../lib/supabase';
import { format, addDays, subDays, parseISO } from 'date-fns';

interface ExpiryRef {
  name: string;
  icon: string;
  fridge_days: number;
}

const QUICK_EXPIRY = [
  { label: 'Today',  days: 0 },
  { label: '1 day',  days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
];

const PURCHASE_AGO = [
  { label: 'Today',        days: 0  },
  { label: 'Few days ago', days: 3  },
  { label: '~1 week ago',  days: 7  },
  { label: '2+ weeks ago', days: 14 },
];

export default function AddItemScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🥦');
  const [expiryDate, setExpiryDate] = useState(format(addDays(new Date(), 3), 'yyyy-MM-dd'));
  const [purchaseDaysAgo, setPurchaseDaysAgo] = useState(0);
  const [loading, setLoading] = useState(false);
  const [commonItems, setCommonItems] = useState<ExpiryRef[]>([]);

  const { addItem } = useFridgeStore();

  useEffect(() => {
    supabase
      .from('expiry_reference')
      .select('name, icon, fridge_days')
      .not('fridge_days', 'is', null)
      .order('name')
      .then(({ data }) => { if (data?.length) setCommonItems(data as ExpiryRef[]); });
  }, []);

  const effectiveDate = purchaseDaysAgo > 0
    ? format(subDays(parseISO(expiryDate), purchaseDaysAgo), 'yyyy-MM-dd')
    : expiryDate;

  const handleAdd = async () => {
    if (!name.trim()) { Alert.alert('Please enter an item name'); return; }
    setLoading(true);
    await addItem({ name: name.trim(), icon, expiry_date: effectiveDate });
    setLoading(false);
    navigation.goBack();
  };

  const pickQuick = (days: number) => {
    setExpiryDate(format(addDays(new Date(), days), 'yyyy-MM-dd'));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {commonItems.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Common items</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
            {commonItems.map(item => (
              <TouchableOpacity
                key={item.name}
                style={[styles.chip, name === item.name && styles.chipActive]}
                onPress={() => {
                  setName(item.name);
                  setIcon(item.icon);
                  setExpiryDate(format(addDays(new Date(), item.fridge_days), 'yyyy-MM-dd'));
                }}
              >
                <Text style={styles.chipIcon}>{item.icon}</Text>
                <Text style={[styles.chipText, name === item.name && styles.chipTextActive]}>{item.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      <Text style={styles.sectionTitle}>Item name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Leftover pasta"
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.sectionTitle}>Emoji icon</Text>
      <TextInput
        style={[styles.input, styles.emojiInput]}
        value={icon}
        onChangeText={setIcon}
        maxLength={2}
      />

      <Text style={styles.sectionTitle}>When did you buy it?</Text>
      <View style={styles.quickRow}>
        {PURCHASE_AGO.map(p => (
          <TouchableOpacity
            key={p.label}
            style={[styles.quickBtn, purchaseDaysAgo === p.days && styles.quickBtnActive]}
            onPress={() => setPurchaseDaysAgo(p.days)}
          >
            <Text style={styles.quickBtnText}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Expires in</Text>
      <View style={styles.quickRow}>
        {QUICK_EXPIRY.map(q => (
          <TouchableOpacity
            key={q.label}
            style={[styles.quickBtn, expiryDate === format(addDays(new Date(), q.days), 'yyyy-MM-dd') && styles.quickBtnActive]}
            onPress={() => pickQuick(q.days)}
          >
            <Text style={styles.quickBtnText}>{q.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.expiryText}>Expiry date: {effectiveDate}</Text>

      <TouchableOpacity style={styles.addBtn} onPress={handleAdd} disabled={loading}>
        <Text style={styles.addBtnText}>{loading ? 'Adding…' : `Add ${icon} ${name || 'item'}`}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8, marginTop: 16 },
  chips: { flexDirection: 'row', marginBottom: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f5f5f5', borderRadius: 20, paddingHorizontal: 12,
    paddingVertical: 7, marginRight: 8, borderWidth: 1, borderColor: 'transparent',
  },
  chipActive: { borderColor: '#1D9E75', backgroundColor: '#f0fdf9' },
  chipIcon: { fontSize: 16 },
  chipText: { fontSize: 13, color: '#555' },
  chipTextActive: { color: '#1D9E75', fontWeight: '500' },
  input: {
    borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12,
    padding: 14, fontSize: 15, backgroundColor: '#fafafa',
  },
  emojiInput: { fontSize: 24, textAlign: 'center', width: 70 },
  quickRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  quickBtn: {
    backgroundColor: '#f5f5f5', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'transparent',
  },
  quickBtnActive: { borderColor: '#1D9E75', backgroundColor: '#f0fdf9' },
  quickBtnText: { fontSize: 13, color: '#555' },
  expiryText: { fontSize: 12, color: '#aaa', marginTop: 8 },
  addBtn: {
    backgroundColor: '#1D9E75', borderRadius: 14, padding: 16,
    alignItems: 'center', marginTop: 28,
  },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
