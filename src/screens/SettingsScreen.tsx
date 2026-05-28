import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Switch, TouchableOpacity, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../store/authStore';
import { useHouseholdStore } from '../store/householdStore';
import { supabase } from '../lib/supabase';

export default function SettingsScreen({ navigation }: any) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const { signOut, session } = useAuthStore();
  const { householdName, members, fetchHousehold } = useHouseholdStore();

  const checkNotificationStatus = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('user_id', session.user.id)
      .maybeSingle();
    setNotificationsEnabled(!!data?.push_token);
  }, [session?.user?.id]);

  useFocusEffect(useCallback(() => {
    fetchHousehold();
    checkNotificationStatus();
  }, [checkNotificationStatus]));

  const toggleNotifications = async (value: boolean) => {
    if (!session?.user?.id) return;

    if (value) {
      if (!Device.isDevice) {
        Alert.alert('Not supported', 'Push notifications only work on a physical device.');
        return;
      }
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        Alert.alert('Permission required', 'Enable notifications in your device settings to get expiry reminders.');
        return;
      }
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      });
      await supabase
        .from('profiles')
        .update({ push_token: tokenData.data })
        .eq('user_id', session.user.id);
      setNotificationsEnabled(true);
    } else {
      await supabase
        .from('profiles')
        .update({ push_token: null })
        .eq('user_id', session.user.id);
      setNotificationsEnabled(false);
    }
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
        <View style={styles.row}>
          <Text style={styles.sectionTitle}>Household</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Household')}>
            <Text style={styles.rowLink}>Manage</Text>
          </TouchableOpacity>
        </View>

        {householdName ? (
          <>
            <Text style={styles.householdName}>{householdName}</Text>
            {members.length > 0 && (
              <View style={styles.memberList}>
                {members.map((m, i) => (
                  <View key={m.userId} style={styles.memberRow}>
                    <View style={[styles.memberDot, { backgroundColor: m.color }]}>
                      <Text style={styles.memberDotText}>{m.initials}</Text>
                    </View>
                    <Text style={styles.memberEmail}>{m.email}</Text>
                    {i === 0 && <Text style={styles.ownerBadge}>owner</Text>}
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <Text style={styles.rowSub}>Not in a household</Text>
        )}
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
  rowLink: { fontSize: 13, color: '#1D9E75', fontWeight: '600' },
  householdName: { fontSize: 17, fontWeight: '600', color: '#111', marginBottom: 12 },
  memberList: { gap: 10 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberDot: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  memberDotText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  memberEmail: { flex: 1, fontSize: 14, color: '#444' },
  ownerBadge: {
    fontSize: 10, fontWeight: '600', color: '#1D9E75',
    borderWidth: 1, borderColor: '#1D9E75', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  signOutBtn: { alignItems: 'center', paddingVertical: 4 },
  signOutText: { fontSize: 15, color: '#E24B4A', fontWeight: '500' },
  version: { textAlign: 'center', fontSize: 12, color: '#ccc', marginTop: 'auto', paddingBottom: 20 },
});
