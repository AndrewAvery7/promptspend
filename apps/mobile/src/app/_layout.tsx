import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LaunchStateProvider } from '@/state/useLaunchState';
import { GuidedTourProvider } from '@/components/GuidedTour';
import { FONT_FAMILIES } from '@/components/AppText';
import { MobileThemeProvider, useMobileTheme } from '@/theme/useMobileTheme';

// Expo Router reads this before the tab navigator mounts. Keeping Home as the
// anchor here makes cold starts and deep-link back navigation deterministic.
export const unstable_settings = { initialRouteName: 'home' };

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <MobileThemeProvider>
        <LaunchStateProvider>
          <GuidedTourProvider>
            <ThemedTabs />
          </GuidedTourProvider>
        </LaunchStateProvider>
      </MobileThemeProvider>
    </SafeAreaProvider>
  );
}

function ThemedTabs() {
  const { isDark, theme } = useMobileTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Tabs
        backBehavior="history"
        initialRouteName="home"
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: theme.background },
          tabBarActiveTintColor: theme.accent,
          tabBarHideOnKeyboard: true,
          tabBarInactiveTintColor: theme.mutedText,
          tabBarItemStyle: { minHeight: 52, paddingVertical: 4 },
          tabBarLabelStyle: { fontFamily: FONT_FAMILIES.body, fontSize: 11, fontWeight: '600' },
          tabBarStyle: {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            minHeight: 64,
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            tabBarAccessibilityLabel: 'Home, Cost Brief',
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons color={color} name={focused ? 'home' : 'home-outline'} size={size} />
            ),
            title: 'Home',
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            tabBarAccessibilityLabel: 'Estimate one model',
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons color={color} name={focused ? 'calculator' : 'calculator-outline'} size={size} />
            ),
            title: 'Estimate',
          }}
        />
        <Tabs.Screen
          name="compare"
          options={{
            tabBarAccessibilityLabel: 'Compare up to four models',
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons color={color} name={focused ? 'podium' : 'podium-outline'} size={size} />
            ),
            title: 'Compare',
          }}
        />
        <Tabs.Screen
          name="learn"
          options={{
            tabBarAccessibilityLabel: 'Learn about AI costs',
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons color={color} name={focused ? 'book' : 'book-outline'} size={size} />
            ),
            title: 'Learn',
          }}
        />
        <Tabs.Screen
          name="data"
          options={{
            tabBarAccessibilityLabel: 'Data and Alerts',
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons color={color} name={focused ? 'pulse' : 'pulse-outline'} size={size} />
            ),
            title: 'Data & Alerts',
          }}
        />
      </Tabs>
    </>
  );
}
