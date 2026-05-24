import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, Share, ActivityIndicator, ScrollView,
} from 'react-native';
import { useHouseholdStore } from '../store/householdStore';
import { useAuthStore } from '../store/authStore';

export default function HouseholdScreen() {
  const { members, householdId, householdName, createHousehold, createInvite, leaveHousehold, acceptInvite } = useHouseholdStore();
  const { session } = useAuthStore();
  const myUserId = session?.user?.id;

  const [hhName, setHhName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const [loading, setLoading] = useState(false);

  const inHousehold = !!householdId;

  const handleCreate = async () => {
    if (!hhName.trim()) return;
    setLoading(true);
    const err = await createHousehold(hhName.trim());
    setLoading(false);
    if (err) Alert.alert('Error', err);
    else setHhName('');
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setLoading(true);
    const result = await createInvite(inviteEmail.trim().toLowerCase());
    setLoading(false);

    if ('error' in result) {
      Alert.alert('Error', result.error);
      return;
    }

    setInviteEmail('');
    await Share.share({
      message: `Join my CheckFridge household! Tap the link or paste this token in the app:\n\n${result.link}`,
    });
  };

  const handleJoin = async () => {
    const token = joinToken.trim();
    if (!token) return;
    setLoading(true);
    const err = await acceptInvite(token);
    setLoading(false);
    if (err) Alert.alert('Could not join', err);
    else { setJoinToken(''); Alert.alert('Joined!', `Welcome to ${householdName ?? 'the household'}.`); }
  };

  const handleLeave = () => {
    Alert.alert(
      'Leave household',
      `Leave "${householdName}"? Your fridge items stay, but you'll no longer share with this household.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave', style: 'destructive', onPress: async () => {
            setLoading(true);
            const err = await leaveHousehold();
            setLoading(false);
            if (err) Alert.alert('Error', err);
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1D9E75" />
      </View>
    );
  }

  if (inHousehold) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.title}>{householdName ?? 'Your household'}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Members ({members.length})</Text>
          {members.map(m => (
            <View key={m.userId} style={styles.memberRow}>
              <View style={[styles.avatar, { backgroundColor: m.color }]}>
                <Text style={styles.avatarText}>{m.initials}</Text>
              </View>
              <Text style={styles.memberEmail}>
                {m.email || m.initials}
                {m.userId === myUserId ? '  · you' : ''}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invite someone</Text>
          <TextInput
            style={styles.input}
            placeholder="their@email.com"
            placeholderTextColor="#bbb"
            value={inviteEmail}
            onChangeText={setInviteEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.btn, !inviteEmail.trim() && styles.btnDisabled]}
            onPress={handleInvite}
            disabled={!inviteEmail.trim()}
          >
            <Text style={styles.btnText}>Create invite link</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>Sends a shareable link — valid for 7 days.</Text>
        </View>

        <View style={styles.section}>
          <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
            <Text style={styles.leaveBtnText}>Leave household</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.title}>Household</Text>
      <Text style={styles.subtitle}>Share your fridge with up to 5 people.</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Create a household</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. The Klinkers"
          placeholderTextColor="#bbb"
          value={hhName}
          onChangeText={setHhName}
        />
        <TouchableOpacity
          style={[styles.btn, !hhName.trim() && styles.btnDisabled]}
          onPress={handleCreate}
          disabled={!hhName.trim()}
        >
          <Text style={styles.btnText}>Create</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Join a household</Text>
        <Text style={styles.hint}>Paste the invite token you received:</Text>
        <TextInput
          style={styles.input}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          placeholderTextColor="#bbb"
          value={joinToken}
          onChangeText={setJoinToken}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.btn, !joinToken.trim() && styles.btnDisabled]}
          onPress={handleJoin}
          disabled={!joinToken.trim()}
        >
          <Text style={styles.btnText}>Join</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '600', color: '#111', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 20 },
  section: {
    backgroundColor: '#fafafa', borderRadius: 14, padding: 16,
    marginBottom: 14, borderWidth: 0.5, borderColor: '#e5e5e5',
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '600', color: '#888',
    marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  memberEmail: { fontSize: 14, color: '#333', flex: 1 },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
    padding: 11, fontSize: 14, color: '#111', marginBottom: 10,
    backgroundColor: '#fff',
  },
  btn: {
    backgroundColor: '#1D9E75', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  btnDisabled: { backgroundColor: '#ccc' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  hint: { fontSize: 12, color: '#aaa', marginTop: 8 },
  leaveBtn: { alignItems: 'center', paddingVertical: 4 },
  leaveBtnText: { color: '#E24B4A', fontSize: 15, fontWeight: '500' },
});
