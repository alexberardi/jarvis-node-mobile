import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import SecretEditDialog from '../../src/components/SecretEditDialog';
import { lightTheme } from '../../src/theme';
import { encryptAndPushConfig } from '../../src/services/configPushService';

jest.mock('../../src/services/configPushService', () => ({
  encryptAndPushConfig: jest.fn(),
}));

const mockedEncrypt = encryptAndPushConfig as jest.MockedFunction<typeof encryptAndPushConfig>;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const baseProps = {
  visible: true,
  onDismiss: jest.fn(),
  onSaved: jest.fn(),
  nodeId: 'node-1',
  accessToken: 'tok-123',
  secretKey: 'WEATHER_API_KEY',
  description: 'API key for the weather service',
  valueType: 'string',
  scope: 'integration',
  isSet: false,
};

describe('SecretEditDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedEncrypt.mockResolvedValue(undefined);
  });

  it('renders dialog title as secretKey', () => {
    const { getByText } = render(
      <SecretEditDialog {...baseProps} />,
      { wrapper },
    );
    expect(getByText('WEATHER_API_KEY')).toBeTruthy();
  });

  it('shows description text', () => {
    const { getByText } = render(
      <SecretEditDialog {...baseProps} />,
      { wrapper },
    );
    expect(getByText('API key for the weather service')).toBeTruthy();
  });

  it('shows text input for string type', () => {
    const { getByDisplayValue, queryByText } = render(
      <SecretEditDialog {...baseProps} valueType="string" currentValue="abc" />,
      { wrapper },
    );
    // TextInput should show the current value
    expect(getByDisplayValue('abc')).toBeTruthy();
    // Should NOT show a switch
    expect(queryByText('Enabled')).toBeNull();
  });

  it('shows switch for bool type', () => {
    const { getByText } = render(
      <SecretEditDialog {...baseProps} valueType="bool" />,
      { wrapper },
    );
    expect(getByText('Enabled')).toBeTruthy();
  });

  it('shows secure input for key/token/password/secret fields', () => {
    // secretKey contains "KEY" so secureTextEntry should be true
    // The TextInput from react-native-paper wraps RN TextInput.
    // We verify by checking the tree for secureTextEntry prop.
    const tree = JSON.stringify(render(
      <SecretEditDialog {...baseProps} secretKey="MY_SECRET_TOKEN" valueType="string" />,
      { wrapper },
    ).toJSON());
    expect(tree).toContain('secureTextEntry');
  });

  it('has Save and Cancel buttons', () => {
    const { getByText } = render(
      <SecretEditDialog {...baseProps} />,
      { wrapper },
    );
    expect(getByText('Save')).toBeTruthy();
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('shows Delete button when isSet is true', () => {
    const { getByText } = render(
      <SecretEditDialog {...baseProps} isSet={true} />,
      { wrapper },
    );
    expect(getByText('Delete')).toBeTruthy();
  });

  it('hides Delete button when isSet is false', () => {
    const { queryByText } = render(
      <SecretEditDialog {...baseProps} isSet={false} />,
      { wrapper },
    );
    expect(queryByText('Delete')).toBeNull();
  });

  it('calls encryptAndPushConfig on save', async () => {
    const onSaved = jest.fn();
    const { getByText, getByDisplayValue } = render(
      <SecretEditDialog {...baseProps} onSaved={onSaved} currentValue="" />,
      { wrapper },
    );

    // Type a value into the input
    const input = getByDisplayValue('');
    fireEvent.changeText(input, 'my-api-key');

    // Press Save
    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(mockedEncrypt).toHaveBeenCalledWith(
        'node-1',
        'settings:secrets',
        { WEATHER_API_KEY: 'my-api-key' },
      );
    });

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('shows error on failure', async () => {
    mockedEncrypt.mockRejectedValue(new Error('Network error'));

    const { getByText, getByDisplayValue } = render(
      <SecretEditDialog {...baseProps} currentValue="" />,
      { wrapper },
    );

    fireEvent.changeText(getByDisplayValue(''), 'some-value');
    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(getByText('Network error')).toBeTruthy();
    });
  });
});
