import { createContext, useContext, type PropsWithChildren } from 'react';

const NumericDraftScope = createContext(true);

/** Keep retained, unfocused tab inputs out of another screen's action barrier. */
export function NumericDraftScopeProvider({ active, children }: PropsWithChildren<{ active: boolean }>) {
  return <NumericDraftScope.Provider value={active}>{children}</NumericDraftScope.Provider>;
}

export function useNumericDraftScopeActive(): boolean {
  return useContext(NumericDraftScope);
}
