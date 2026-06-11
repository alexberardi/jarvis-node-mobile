import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import SecretEditDialog from '../../src/components/SecretEditDialog';
import { lightTheme } from '../../src/theme';
import { encryptAndPushConfig } from '../../src/services/configPushService';

jest.mock('../../src/services/configPushService', () => ({
  encryptAndPushConfig: jest.fn(),
}));

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    state: { user: { id: 1 }, accessToken: 'tok-123' },
  }),
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

  it('renders a text input for unknown value types (forward compat)', () => {
    const { getByDisplayValue, queryByText } = render(
      <SecretEditDialog {...baseProps} valueType="some_future_type" currentValue="" />,
      { wrapper },
    );
    expect(getByDisplayValue('')).toBeTruthy();
    expect(queryByText('Enabled')).toBeNull();
    expect(queryByText('Select a person')).toBeNull();
  });
});

describe('SecretEditDialog — "user" value type', () => {
  const members = [
    { user_id: 7, username: 'alex', email: 'alex@example.com', role: 'admin' },
    { user_id: 8, username: 'sam', email: 'sam@example.com', role: 'member' },
  ];

  const userProps = {
    ...baseProps,
    secretKey: 'EMAIL_AGENT_USER',
    description: 'Who this agent runs as',
    valueType: 'user',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedEncrypt.mockResolvedValue(undefined);
  });

  it('renders a member picker instead of a text input', () => {
    const { getByText, queryByDisplayValue } = render(
      <SecretEditDialog {...userProps} householdMembers={members} />,
      { wrapper },
    );
    expect(getByText('Select a person')).toBeTruthy();
    expect(queryByDisplayValue('')).toBeNull();
  });

  it('shows the current member name when the stored id matches', () => {
    const { getByText } = render(
      <SecretEditDialog {...userProps} householdMembers={members} isSet currentValue="7" />,
      { wrapper },
    );
    expect(getByText('alex')).toBeTruthy();
  });

  it('selecting a member and saving sends the member id as the value', async () => {
    const onSaved = jest.fn();
    const { getByText } = render(
      <SecretEditDialog {...userProps} householdMembers={members} onSaved={onSaved} />,
      { wrapper },
    );

    // Open the picker and choose a member by display name.
    fireEvent.press(getByText('Select a person'));
    await waitFor(() => expect(getByText('sam')).toBeTruthy());
    fireEvent.press(getByText('sam'));

    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(mockedEncrypt).toHaveBeenCalledWith(
        'node-1',
        'settings:secrets',
        { EMAIL_AGENT_USER: '8' },
      );
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('falls back to a plain id input with a hint when members are unavailable', () => {
    const { getByText, getByDisplayValue, queryByText } = render(
      <SecretEditDialog {...userProps} householdMembers={null} />,
      { wrapper },
    );
    expect(queryByText('Select a person')).toBeNull();
    expect(getByDisplayValue('')).toBeTruthy();
    expect(getByText('Enter a user id')).toBeTruthy();
  });

  it('fallback input saves the typed id through the normal path', async () => {
    const { getByText, getByDisplayValue } = render(
      <SecretEditDialog {...userProps} householdMembers={undefined} />,
      { wrapper },
    );

    fireEvent.changeText(getByDisplayValue(''), '42');
    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(mockedEncrypt).toHaveBeenCalledWith(
        'node-1',
        'settings:secrets',
        { EMAIL_AGENT_USER: '42' },
      );
    });
  });
});
