import { createContext, useContext } from 'react';

export const RightPanelContext = createContext(null);

export function useRightPanel() {
    return useContext(RightPanelContext);
}
