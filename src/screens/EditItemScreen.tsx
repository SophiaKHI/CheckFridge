import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { parseISO, format } from 'date-fns';
import { useFridgeStore } from '../store/fridgeStore';
import { FridgeItem } from '../types';

export default function EditItemScreen({ route, navigation }: any) {
  const { item } = route.params as { item: FridgeItem };
  const { updateItem } = useFridgeStore();

  const [name, setName] = useState(item.name);
  const [icon, setIcon] = useState(item.icon);
  const [expiryDate, setExpiryDate] = useState(parseISO(item.expiry_date));
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Please enter a name'); return; }
    setLoading(true);
    await updateItem(item.id, {
      name: name.trim(),
      icon,
      expiry_date: format(expiryDate, 'yyyy-MM-dd'),
    });
    setLoading(false);
    navigation.goBack();
  };

  const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (date) setExpiryDate(date);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Emoji icon</Text>
      <TextInput
        style={[styles.input, styles.emojiInput]}
        value={icon}
        onChangeText={setIcon}
        maxLength={2}
      />

      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Item name"
      />

      <Text style={styles.label}>Expiry date</Text>
      <View style={styles.pickerContainer}>
        <DateTimePicker
          value={expiryDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDateChange}
          style={styles.datePicker}
          themeVariant="light"
        />
      </View>

      <Text style={styles.expiryPreview}>Expires: {format(expiryDate, 'd MMMM yyyy')}</Text>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
        <Text style={styles.saveBtnText}>{loading ? 'Saving…' : 'Save changes'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8, marginTop: 20 },
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
  datePicker: { height: 160 },
  expiryPreview: {
    fontSize: 14, color: '#1D9E75', fontWeight: '600',
    marginTop: 10, paddingHorizontal: 4,
  },
  saveBtn: {
    backgroundColor: '#1D9E75', borderRadius: 14, padding: 16,
    alignItems: 'center', marginTop: 32,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
