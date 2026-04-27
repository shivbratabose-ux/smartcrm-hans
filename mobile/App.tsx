// SmartCRM Mobile — root component (PR #103 redesign).
// ─────────────────────────────────────────────────────────────────────────────
// New IA per the user-approved plan:
//   4 tabs: Today / Plan / Pipeline / More
//   1 persistent FAB (+ button) hovering above the tab bar with a context-
//   aware bottom-sheet (Scan Card / Log Call / New Lead / New Contact).
//
// The FABProvider is mounted ONCE at the root, above the navigator. Each
// screen uses `useFAB(actions)` to publish its action set. The FAB itself
// re-mounts on every navigation but the provider keeps actions reactive.
import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import {
  Home, CalendarDays, TrendingUp, Menu,
} from 'lucide-react-native';
import { queryClient, queryPersister } from '@/lib/queryClient';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { LoginScreen } from '@/auth/LoginScreen';
import { TodayScreen } from '@/screens/TodayScreen';
import { PlanScreen } from '@/screens/PlanScreen';
import { PipelineScreen } from '@/screens/PipelineScreen';
import { MoreScreen } from '@/screens/MoreScreen';
import { LeadsScreen } from '@/screens/LeadsScreen';
import { LeadDetailScreen } from '@/screens/LeadDetailScreen';
import { NewLeadScreen } from '@/screens/NewLeadScreen';
import { ContactsScreen } from '@/screens/ContactsScreen';
import { NewContactScreen } from '@/screens/NewContactScreen';
import { LogCallScreen } from '@/screens/LogCallScreen';
import { ScanCardScreen } from '@/screens/ScanCardScreen';
import { FAB, FABProvider } from '@/components/ui';
import { usePushSetup } from '@/hooks/usePushSetup';
import { colors, fontSize, fontWeight } from '@/theme';

type RootStackParamList = {
  Tabs: undefined;
  LeadsList: undefined;
  ContactsList: undefined;
  LeadDetail: { id: string };
  NewLead: undefined;
  NewContact: undefined;
  LogCall: { leadId?: string } | undefined;
  ScanCard: undefined;
};

type TabParamList = {
  Today: undefined;
  Plan: undefined;
  Pipeline: undefined;
  More: undefined;
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
        tabBarStyle: {
          borderTopColor: colors.border,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
          backgroundColor: colors.surface,
        },
        tabBarLabelStyle: {
          fontSize: fontSize.xs - 1,
          fontWeight: fontWeight.semi,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="Today"
        children={({ navigation }) => (
          <TodayScreen
            onNewLead={()    => navigation.getParent()?.navigate('NewLead')}
            onNewContact={() => navigation.getParent()?.navigate('NewContact')}
            // PR #107: in-app Log Call form + business-card camera capture.
            // Both navigate to dedicated stack screens so the user gets a
            // proper back button and we don't fight the FAB sheet for space.
            onLogCall={() => navigation.getParent()?.navigate('LogCall')}
            onScanCard={() => navigation.getParent()?.navigate('ScanCard')}
            onOpenLead={(id) => navigation.getParent()?.navigate('LeadDetail', { id })}
            // Tap a KPI tile on Today → jump to Plan tab with the matching
            // chip pre-selected. The mapping below converts KPI category
            // (followups / meetings / tasks / calls) → Plan chip filter
            // (today / today / today / today). All KPIs land on "Today"
            // because that's what the KPI counts represent — when this
            // changes (e.g. "Overdue followups" KPI), the mapping grows.
            onOpenPlan={(_filter) => navigation.jumpTo('Plan', { initialFilter: 'today' })}
          />
        )}
        options={{ tabBarIcon: ({ color, size }) => <Home size={size} color={color}/> }}
      />
      <Tabs.Screen
        name="Plan"
        // PlanScreen reads `initialFilter` from route params (set by Today's
        // KPI tap) but defaults to 'today' when entered directly.
        children={({ route }) => (
          <PlanScreen initialFilter={(route.params as any)?.initialFilter}/>
        )}
        options={{ tabBarIcon: ({ color, size }) => <CalendarDays size={size} color={color}/> }}
      />
      <Tabs.Screen
        name="Pipeline"
        component={PipelineScreen}
        options={{ tabBarIcon: ({ color, size }) => <TrendingUp size={size} color={color}/> }}
      />
      <Tabs.Screen
        name="More"
        children={({ navigation }) => (
          <MoreScreen
            onOpenContacts={() => navigation.getParent()?.navigate('ContactsList')}
            onOpenLeads={()    => navigation.getParent()?.navigate('LeadsList')}
          />
        )}
        options={{ tabBarIcon: ({ color, size }) => <Menu size={size} color={color}/> }}
      />
    </Tabs.Navigator>
  );
}

function AuthedApp() {
  // Register this device for push notifications. Hook is no-op on web /
  // simulator / when notification permission is denied — purely best-effort.
  usePushSetup();
  return (
    <NavigationContainer>
      <FABProvider>
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="Tabs" component={TabNavigator}/>

          {/* List screens reachable via "More" — kept as stack screens
              so they get a proper back button automatically. */}
          <RootStack.Screen
            name="LeadsList"
            options={{ presentation: 'card' }}
            children={({ navigation }) => (
              <LeadsScreen
                onOpen={(id) => navigation.navigate('LeadDetail', { id })}
                onNew={() => navigation.navigate('NewLead')}
              />
            )}
          />
          <RootStack.Screen
            name="ContactsList"
            options={{ presentation: 'card' }}
            children={({ navigation }) => (
              <ContactsScreen onNew={() => navigation.navigate('NewContact')}/>
            )}
          />
          <RootStack.Screen
            name="LeadDetail"
            options={{ presentation: 'card' }}
            children={({ navigation, route }) => (
              <LeadDetailScreen
                leadId={route.params.id}
                onBack={() => navigation.goBack()}
                // From the lead detail page, "Log a call for this lead"
                // jumps into the LogCall form pre-pinned to this lead so
                // the user doesn't have to re-search it.
                onLogCall={(id) => navigation.navigate('LogCall', { leadId: id })}
              />
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
          <RootStack.Screen
            name="LogCall"
            options={{ presentation: 'modal' }}
            children={({ navigation, route }) => (
              <LogCallScreen
                onBack={() => navigation.goBack()}
                preselectLeadId={route.params?.leadId}
              />
            )}
          />
          <RootStack.Screen
            name="ScanCard"
            options={{ presentation: 'modal' }}
            children={({ navigation }) => (
              <ScanCardScreen onBack={() => navigation.goBack()}/>
            )}
          />
        </RootStack.Navigator>

        {/* Persistent FAB — hovers above the tab bar on every screen.
            Hidden automatically when no actions are registered (so it
            doesn't appear on Login / modal forms). */}
        <FAB bottomOffset={80}/>
      </FABProvider>
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
        <Text style={styles.gateError}>Your account is deactivated. Contact your administrator.</Text>
      </View>
    );
  }
  return <AuthedApp/>;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.brand}/>
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
