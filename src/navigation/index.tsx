import React, { useEffect, useRef } from 'react';
import { Alert, Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useHouseholdStore } from '../store/householdStore';

import LoginScreen from '../screens/LoginScreen';
import FridgeScreen from '../screens/FridgeScreen';
import RecipesScreen from '../screens/RecipesScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import HouseholdScreen from '../screens/HouseholdScreen';
import AddItemScreen from '../screens/AddItemScreen';
import ScanFridgeScreen from '../screens/ScanFridgeScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function parseInviteToken(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('token');
  } catch {
    // fallback for non-standard URL parsers
    const match = url.match(/[?&]token=([^&]+)/);
    return match?.[1] ?? null;
  }
}

function FridgeStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="FridgeHome" component={FridgeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AddItem" component={AddItemScreen} options={{ title: 'Add item', headerBackTitle: 'Fridge' }} />
      <Stack.Screen name="ScanFridge" component={ScanFridgeScreen} options={{ title: 'Scan fridge', headerBackTitle: 'Fridge' }} />
    </Stack.Navigator>
  );
}

function SettingsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="SettingsHome" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen name="Household" component={HouseholdScreen} options={{ title: 'Household', headerBackTitle: 'Settings' }} />
    </Stack.Navigator>
  );
}

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1D9E75',
        tabBarInactiveTintColor: '#aaa',
        tabBarStyle: { borderTopWidth: 0.5, borderTopColor: '#eee' },
      }}
    >
      <Tab.Screen
        name="Fridge"
        component={FridgeStack}
        options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🧊</Text> }}
      />
      <Tab.Screen
        name="Recipes"
        component={RecipesScreen}
        options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>🍳</Text>, headerShown: true }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>📋</Text>, headerShown: true, title: 'History' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStack}
        options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>⚙️</Text> }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { session, setSession } = useAuthStore();
  const { acceptInvite } = useHouseholdStore();
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const handleInviteUrl = async (url: string) => {
    if (!url.includes('accept-invite')) return;
    const token = parseInviteToken(url);
    if (!token) return;

    if (!sessionRef.current) {
      Alert.alert('Sign in first', 'Please sign in to CheckFridge before accepting an invite.');
      return;
    }

    Alert.alert(
      'Join household?',
      'You were invited to share a fridge. Accept?',
      [
        { text: 'Decline', style: 'cancel' },
        {
          text: 'Accept', onPress: async () => {
            const result = await acceptInvite(token);
            if ('error' in result) Alert.alert('Could not join', result.error);
            else Alert.alert('Joined!', `Welcome to ${result.householdName}.`);
          },
        },
      ],
    );
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // App opened via deep link while already running
    const sub = Linking.addEventListener('url', ({ url }) => handleInviteUrl(url));
    // App cold-started via deep link
    Linking.getInitialURL().then(url => { if (url) handleInviteUrl(url); });
    return () => sub.remove();
  }, []);

  return (
    <NavigationContainer>
      {session
        ? <AppTabs />
        : <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={LoginScreen} />
          </Stack.Navigator>
      }
    </NavigationContainer>
  );
}
