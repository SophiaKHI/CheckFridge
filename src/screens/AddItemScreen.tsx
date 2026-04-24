import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFridgeStore } from '../store/fridgeStore';
import { supabase } from '../lib/supabase';
import { format, addDays } from 'date-fns';

interface ExpiryRef {
  name: string;
  icon: string;
  fridge_days: number;
}

const DEFAULT_SHELF_DAYS = 7;

export default function AddItemScreen({ navigation }: any) {
  const [name, setName]               = useState('');
  const [icon, setIcon]               = useState('🥦');
  const [shelfDays, setShelfDays]     = useState(DEFAULT_SHELF_DAYS);
  const [purchaseDate, setPurchaseDate] = useState(new Date());
  const [loading, setLoading]         = useState(false);
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

  // Derived expiry: purchase date + shelf life from reference (or 7-day default)
  const expiryDate  = addDays(purchaseDate, shelfDays);
  const expiryLabel = format(expiryDate, 'd MMMM yyyy');

  // Debug: trace expiry calculation so mismatches are visible in Metro
  const matchedRef = commonItems.find(i => i.name === name);
  console.log(
    `[AddItem] name="${name}" matched="${matchedRef?.name ?? 'none'}" ` +
    `fridge_days=${matchedRef?.fridge_days ?? 'n/a'} shelfDays=${shelfDays} ` +
    `purchaseDate=${format(purchaseDate, 'yyyy-MM-dd')} → expiry=${format(expiryDate, 'yyyy-MM-dd')}`,
  );

  const handleAdd = async () => {
    if (!name.trim()) { Alert.alert('Please enter an item name'); return; }
    setLoading(true);
    await addItem({ name: name.trim(), icon, expiry_date: format(expiryDate, 'yyyy-MM-dd') });
    setLoading(false);
    navigation.goBack();
  };

  const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (date) setPurchaseDate(date);
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
                  setShelfDays(item.fridge_days);
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
        onChangeText={text => {
          setName(text);
          // Reset shelf days to default when user types a custom name
          if (!commonItems.find(i => i.name === text)) setShelfDays(DEFAULT_SHELF_DAYS);
        }}
      />

      <Text style={styles.sectionTitle}>Emoji icon</Text>
      <TextInput
        style={[styles.input, styles.emojiInput]}
        value={icon}
        onChangeText={setIcon}
        maxLength={2}
      />

      <Text style={styles.sectionTitle}>Purchase date</Text>
      <View style={styles.pickerContainer}>
        <DateTimePicker
          value={purchaseDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          onChange={onDateChange}
          style={styles.datePicker}
          themeVariant="light"
        />
      </View>

      <View style={styles.expiryRow}>
        <Text style={styles.expiryLabel}>Expires: </Text>
        <Text style={styles.expiryValue}>{expiryLabel}</Text>
      </View>

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
  pickerContainer: {
    backgroundColor: '#fafafa', borderRadius: 12,
    borderWidth: 1, borderColor: '#e5e5e5',
    overflow: 'hidden',
  },
  datePicker: {
    height: 160,
  },
  expiryRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 12, paddingHorizontal: 4,
  },
  expiryLabel: { fontSize: 14, color: '#888' },
  expiryValue: { fontSize: 14, fontWeight: '600', color: '#1D9E75' },
  addBtn: {
    backgroundColor: '#1D9E75', borderRadius: 14, padding: 16,
    alignItems: 'center', marginTop: 28,
  },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
