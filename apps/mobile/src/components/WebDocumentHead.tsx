interface WebDocumentHeadProps {
  description: string;
  title: string;
}

/**
 * Native routes do not register web document metadata. Importing Expo Head on
 * iOS creates an addressable NSUserActivity and requires a configured Handoff
 * origin. PromptSpend has not enabled that cross-device contract for launch.
 */
export function WebDocumentHead(_props: WebDocumentHeadProps) {
  return null;
}
