import React, { ReactNode } from 'react';
import { PaperProvider } from 'react-native-paper';

import { ProvisioningProvider } from '../src/contexts/ProvisioningContext';
import { lightTheme } from '../src/theme';

interface WrapperProps {
  children: ReactNode;
}

export const TestWrapper = ({ children }: WrapperProps) => (
  <PaperProvider theme={lightTheme}>
    <ProvisioningProvider>{children}</ProvisioningProvider>
  </PaperProvider>
);

export const PaperWrapper = ({ children }: WrapperProps) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);
