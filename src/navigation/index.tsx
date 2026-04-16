import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

import LoginScreen from '../screens/LoginScreen';
import FridgeScreen from '../screens/FridgeScreen';
import RecipesScreen from '../screens/RecipesScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AddItemScreen from '../screens/AddItemScreen';
import ScanFridgeScreen from '../screens/ScanFridgeScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function FridgeStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="FridgeHome" component={FridgeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AddItem" component={AddItemScreen} options={{ title: 'Add item', headerBackTitle: 'Fridge' }} />
      <Stack.Screen name="ScanFridge" component={ScanFridgeScreen} options={{ title: 'Scan fridge', headerBackTitle: 'Fridge' }} />
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
        component={SettingsScreen}
        options={{ tabBarIcon: () => <Text style={{ fontSize: 20 }}>⚙️</Text>, headerShown: true }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { session, setSession } = useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
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
