// SmartCRM Mobile — root component.
// ─────────────────────────────────────────────────────────────────────────────
// Boot order:
//   1. SafeAreaProvider — gives screens access to notch / status-bar insets
//   2. PersistQueryClientProvider — TanStack Query + AsyncStorage persistence
//      so cached data is on screen the moment the app opens, even offline
//   3. AuthProvider — session + CRM profile
//   4. NavigationContainer with the bottom-tab navigator
//
// Why no expo-router file routing? Because the user's spec is a fixed
// 4-tab IA (Dashboard / Leads / Contacts / Activity) plus modal-style
// detail screens. Hand-rolled React Navigation gives us tighter control
// over the cross-tab "open Lead detail from Dashboard" flow without the
// file-system constraints of expo-router.
import 'react-native-gesture-handler';
import React, { useState } from 'react';
import { StatusBar, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Home, Users, ContactRound, ListChecks } from 'lucide-react-native';
import { queryClient, queryPersister } from '@/lib/queryClient';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { LoginScreen } from '@/auth/LoginScreen';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { LeadsScreen } from '@/screens/LeadsScreen';
import { LeadDetailScreen } from '@/screens/LeadDetailScreen';
import { NewLeadScreen } from '@/screens/NewLeadScreen';
import { ContactsScreen } from '@/screens/ContactsScreen';
import { NewContactScreen } from '@/screens/NewContactScreen';
import { ActivityLogScreen } from '@/screens/ActivityLogScreen';
import { colors, fontSize } from '@/theme';

type RootStackParamList = {
  Tabs: undefined;
  LeadDetail: { id: string };
  NewLead: undefined;
  NewContact: undefined;
};

type TabParamList = {
  Dashboard: undefined;
  Leads: undefined;
  Contacts: undefined;
  Activity: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

function TabNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.text3,
        tabBarStyle: { borderTopColor: colors.border, height: 60, paddingTop: 6, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="Dashboard"
        children={({ navigation }) => (
          <DashboardScreen
            onGoLeads={() => navigation.jumpTo('Leads')}
            onGoActivity={() => navigation.jumpTo('Activity')}
            onNewLead={() => navigation.getParent()?.navigate('NewLead')}
            onNewContact={() => navigation.getParent()?.navigate('NewContact')}
          />
        )}
        options={{ tabBarIcon: ({ color, size }) => <Home size={size} color={color}/> }}
      />
      <Tabs.Screen
        name="Leads"
        children={({ navigation }) => (
          <LeadsScreen
            onOpen={(id) => navigation.getParent()?.navigate('LeadDetail', { id })}
            onNew={() => navigation.getParent()?.navigate('NewLead')}
          />
        )}
        options={{ tabBarIcon: ({ color, size }) => <Users size={size} color={color}/> }}
      />
      <Tabs.Screen
        name="Contacts"
        children={({ navigation }) => (
          <ContactsScreen onNew={() => navigation.getParent()?.navigate('NewContact')}/>
        )}
        options={{ tabBarIcon: ({ color, size }) => <ContactRound size={size} color={color}/> }}
      />
      <Tabs.Screen
        name="Activity"
        component={ActivityLogScreen}
        options={{ tabBarIcon: ({ color, size }) => <ListChecks size={size} color={color}/> }}
      />
    </Tabs.Navigator>
  );
}

function AuthedApp() {
  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Tabs" component={TabNavigator}/>
        <RootStack.Screen
          name="LeadDetail"
          // We pass props directly via children() so the screen can take
          // an `id` from route.params and a typed `onBack` callback.
          options={{ presentation: 'card' }}
          children={({ navigation, route }) => (
            <LeadDetailScreen leadId={route.params.id} onBack={() => navigation.goBack()}/>
          )}
        />
        <RootStack.Screen
          name="NewLead"
          options={{ presentation: 'modal' }}
          children={({ navigation }) => <NewLeadScreen onBack={() => navigation.goBack()}/>}
        />
        <RootStack.Screen
          name="NewContact"
          options={{ presentation: 'modal' }}
          children={({ navigation }) => <NewContactScreen onBack={() => navigation.goBack()}/>}
        />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

function Gate() {
  const { session, loading, profile } = useAuth();

  if (loading) {
    return (
      <View style={styles.gate}>
        <ActivityIndicator size="large" color={colors.brand}/>
        <Text style={styles.gateText}>Loading…</Text>
      </View>
    );
  }
  if (!session) return <LoginScreen/>;
  if (!profile) {
    return (
      <View style={styles.gate}>
        <Text style={styles.gateError}>
          You're signed in, but this email isn't linked to a CRM profile yet.
          Ask your admin to add you in the web app.
        </Text>
      </View>
    );
  }
  if (!profile.active) {
    return (
      <View style={styles.gate}>
        <Text style={styles.gateError}>
          Your account is deactivated. Contact your administrator.
        </Text>
      </View>
    );
  }
  return <AuthedApp/>;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: queryPersister, maxAge: 1000 * 60 * 60 * 24 }}
      >
        <AuthProvider>
          <Gate/>
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  gate: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg, padding: 24,
  },
  gateText: { marginTop: 12, color: colors.text3, fontSize: fontSize.sm },
  gateError: { color: colors.red, fontSize: fontSize.md, textAlign: 'center', lineHeight: 22 },
});
