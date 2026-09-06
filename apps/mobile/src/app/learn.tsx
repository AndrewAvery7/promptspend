import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { EstimatorWorkspace } from './estimate';

export default function LearnScreen() {
  const router = useRouter();
  const consumeHelp = useCallback(() => router.setParams({ help: undefined }), [router]);
  const { help } = useLocalSearchParams<{ help?: string | string[] }>();
  const helpEntryId = Array.isArray(help) ? help[0] : help;
  return <EstimatorWorkspace helpEntryId={helpEntryId} onHelpEntryConsumed={consumeHelp} section="learn" />;
}
