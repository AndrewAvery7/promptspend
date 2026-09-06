import { Alert, Pressable, View } from 'react-native';
import { AppText as Text } from './AppText';
import { useLaunchState } from '@/state/useLaunchState';
import { useMobileTheme } from '@/theme/useMobileTheme';

export function PersistenceStatus() {
  const state = useLaunchState();
  const { theme } = useMobileTheme();
  if (!state.persistenceNotice) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.warning,
        borderWidth: 1,
        borderRadius: 14,
        padding: 16,
        gap: 8,
      }}
    >
      <Text style={{ color: theme.text, fontSize: 14, lineHeight: 21 }}>{state.persistenceNotice}</Text>
      {state.persistenceBlocked && (
        <>
          <Pressable
            accessibilityRole="button"
            disabled={state.persistenceBusy || !state.hydrated}
            onPress={() => void state.retryPersistence()}
            style={({ pressed }) => ({
              minHeight: 48,
              justifyContent: 'center',
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <Text style={{ color: theme.accent }}>Retry reading saved data</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={state.persistenceBusy || !state.hydrated}
            onPress={() =>
              Alert.alert(
                'Start a separate save area?',
                'Previous unreadable data will stay preserved. This creates an empty, separate area for new scenarios and watched models; it does not recover the old scenarios.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Start separate area', onPress: () => void state.recoverPersistence() },
                ],
              )
            }
            style={({ pressed }) => ({
              minHeight: 48,
              justifyContent: 'center',
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <Text style={{ color: theme.accent }}>Start separate local save area</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
