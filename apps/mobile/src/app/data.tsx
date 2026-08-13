import { useLocalSearchParams } from 'expo-router';

import { EstimatorWorkspace } from './index';

export default function DataAndAlertsScreen() {
  const { alerts } = useLocalSearchParams<{ alerts?: string | string[] }>();
  const alertToken = Array.isArray(alerts) ? alerts[0] : alerts;
  return <EstimatorWorkspace alertToken={alertToken} section="data" />;
}
