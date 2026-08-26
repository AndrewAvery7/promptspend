import { useLocalSearchParams } from 'expo-router';

import { EstimatorWorkspace } from './estimate';

export default function LearnScreen() {
  const { help } = useLocalSearchParams<{ help?: string | string[] }>();
  const helpEntryId = Array.isArray(help) ? help[0] : help;
  return <EstimatorWorkspace helpEntryId={helpEntryId} section="learn" />;
}
