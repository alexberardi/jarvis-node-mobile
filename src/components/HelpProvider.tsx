import React, { createContext, useCallback, useContext, useState, PropsWithChildren } from 'react';
import { Portal, Snackbar } from 'react-native-paper';

type ShowHelp = (text: string) => void;

const HelpContext = createContext<ShowHelp | null>(null);

export const HelpProvider = ({ children }: PropsWithChildren) => {
  const [text, setText] = useState<string | null>(null);
  const dismiss = useCallback(() => setText(null), []);

  return (
    <HelpContext.Provider value={setText}>
      {children}
      <Portal>
        <Snackbar
          visible={text !== null}
          onDismiss={dismiss}
          duration={6000}
          action={{ label: 'Got it', onPress: dismiss }}
        >
          {text || ''}
        </Snackbar>
      </Portal>
    </HelpContext.Provider>
  );
};

export const useHelp = (): ShowHelp => {
  const ctx = useContext(HelpContext);
  if (!ctx) {
    throw new Error('useHelp must be used within HelpProvider');
  }
  return ctx;
};
