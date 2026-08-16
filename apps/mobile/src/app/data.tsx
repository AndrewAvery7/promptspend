import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { EstimatorWorkspace } from './index';

export default function DataAndAlertsScreen() {
  const router = useRouter();
  const { alerts } = useLocalSearchParams<{ alerts?: string | string[] }>();
  const alertToken = Array.isArray(alerts) ? alerts[0] : alerts;
  useEffect(() => {
    if (alertToken) router.setParams({ alerts: undefined });
  }, [alertToken, router]);
  return <EstimatorWorkspace alertToken={alertToken} section="data" />;
}
