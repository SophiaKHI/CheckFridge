import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Switch, TouchableOpacity, Alert,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import * as Notifications from 'expo-notifications';

export default function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const { signOut, session } = useAuthStore();

  const toggleNotifications = async (value: boolean) => {
    if (value) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Enable notifications in your device settings to get expiry reminders.');
        return;
      }
    }
    setNotificationsEnabled(value);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Signed in as</Text>
          <Text style={styles.rowValue}>{session?.user?.email ?? '—'}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.row}>
          <View>
            <Text style={styles.rowLabel}>Expiry reminders</Text>
            <Text style={styles.rowSub}>Alert when items expire in ≤ 2 days</Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={toggleNotifications}
            trackColor={{ true: '#1D9E75' }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>CheckFridge v1.0.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  title: { fontSize: 22, fontWeight: '600', color: '#111', marginBottom: 24 },
  section: {
    backgroundColor: '#fafafa', borderRadius: 14, padding: 16,
    marginBottom: 14, borderWidth: 0.5, borderColor: '#e5e5e5',
  },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 15, color: '#111' },
  rowSub: { fontSize: 12, color: '#aaa', marginTop: 2 },
  rowValue: { fontSize: 13, color: '#888' },
  signOutBtn: { alignItems: 'center', paddingVertical: 4 },
  signOutText: { fontSize: 15, color: '#E24B4A', fontWeight: '500' },
  version: { textAlign: 'center', fontSize: 12, color: '#ccc', marginTop: 'auto', paddingBottom: 20 },
});
