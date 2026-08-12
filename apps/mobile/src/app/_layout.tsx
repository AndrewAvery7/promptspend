import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MobileThemeProvider, useMobileTheme } from '@/theme/useMobileTheme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <MobileThemeProvider>
        <ThemedStack />
      </MobileThemeProvider>
    </SafeAreaProvider>
  );
}

function ThemedStack() {
  const { isDark, theme } = useMobileTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: theme.background },
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" options={{ title: 'PromptSpend — LLM cost estimator' }} />
      </Stack>
    </>
  );
}
