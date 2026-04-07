import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useAuthStore } from '../store/authStore';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signIn, signUp } = useAuthStore();

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    const err = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password);
    if (err) setError(err);
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>🧊</Text>
        <Text style={styles.title}>CheckFridge</Text>
        <Text style={styles.subtitle}>Track what's in your fridge</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.btn} onPress={handleSubmit} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>{isSignUp ? 'Create account' : 'Sign in'}</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)}>
          <Text style={styles.toggle}>
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  logo: { fontSize: 56, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '600', textAlign: 'center', color: '#111' },
  subtitle: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 40 },
  input: {
    borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12,
    padding: 14, fontSize: 15, marginBottom: 12, backgroundColor: '#fafafa',
  },
  btn: {
    backgroundColor: '#1D9E75', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  toggle: { textAlign: 'center', marginTop: 20, color: '#1D9E75', fontSize: 14 },
  error: { color: '#E24B4A', fontSize: 13, marginBottom: 8, textAlign: 'center' },
});
