import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LaunchStateProvider } from '@/state/useLaunchState';
import { MobileThemeProvider, useMobileTheme } from '@/theme/useMobileTheme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <MobileThemeProvider>
        <LaunchStateProvider>
          <ThemedTabs />
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
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
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
          name="more"
          options={{
            tabBarAccessibilityLabel: 'More, data, alerts, privacy, and settings',
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons
                color={color}
                name={focused ? 'ellipsis-horizontal-circle' : 'ellipsis-horizontal-circle-outline'}
                size={size}
              />
            ),
            title: 'More',
          }}
        />
      </Tabs>
    </>
  );
}
