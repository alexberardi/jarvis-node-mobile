import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import MemoriesEditScreen from '../../src/screens/Memories/MemoriesEditScreen';
import { lightTheme } from '../../src/theme';
import {
  getMemory,
  createMemory,
  updateMemory,
  deleteMemory,
} from '../../src/api/memoriesApi';

// L1 FLOW INTEGRATION — the Memory create/edit form (no prior coverage): the
// create-vs-update branch on save (createMemory includes scope, updateMemory
// omits it), the elevated-only Scope selector, category + pin wiring into the
// payload, the empty-content save gate, edit-mode prefill via getMemory, the
// delete confirm, and the read-only (agent-injected) lockout. Real screen + real
// form state; navigation/route are passed as props, only api/auth are mocked.

let mockAuthState: any;
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: mockAuthState }),
}));

jest.mock('../../src/api/memoriesApi', () => ({
  getMemory: jest.fn(),
  createMemory: jest.fn(),
  updateMemory: jest.fn(),
  deleteMemory: jest.fn(),
}));

const authFor = (role: 'member' | 'admin') => ({
  activeHouseholdId: 'hh-1',
  households: [{ id: 'hh-1', name: 'Home', role }],
});

const makeNav = () => ({ goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() }) as any;

const renderScreen = (params: any, nav = makeNav()) => {
  const utils = render(
    <PaperProvider theme={lightTheme}>
      <MemoriesEditScreen navigation={nav} route={{ params, key: 'k', name: 'MemoryEdit' } as any} />
    </PaperProvider>,
  );
  return { ...utils, nav };
};

const EXISTING = {
  id: 7,
  content: 'I prefer dark mode',
  category: 'preference',
  user_id: 7,
  is_pinned: false,
  editable: true,
  source: 'user',
  updated_at: '2026-06-01T12:00:00Z',
};

describe('Memory edit — flow integration (create/update branch, scope, delete, read-only)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = authFor('member');
    (createMemory as jest.Mock).mockResolvedValue(undefined);
    (updateMemory as jest.Mock).mockResolvedValue(undefined);
    (deleteMemory as jest.Mock).mockResolvedValue(undefined);
    (getMemory as jest.Mock).mockResolvedValue(EXISTING);
  });

  it('create: content + category + pin → createMemory with scope, then goBack', async () => {
    const { getByTestId, getByText, nav } = renderScreen({});

    fireEvent.changeText(getByTestId('memory-content-input'), 'likes oat milk in coffee');
    fireEvent.press(getByText('fact'));
    fireEvent(getByTestId('memory-pin-switch'), 'valueChange', true);

    await act(async () => {
      fireEvent.press(getByTestId('memory-save-button'));
    });

    expect(createMemory).toHaveBeenCalledWith('hh-1', {
      content: 'likes oat milk in coffee',
      category: 'fact',
      is_pinned: true,
      scope: 'user', // member: no Scope selector → default
    });
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('create as admin: the Scope selector sets scope=household in the payload', async () => {
    mockAuthState = authFor('admin');
    const { getByTestId, getByText } = renderScreen({});

    fireEvent.changeText(getByTestId('memory-content-input'), 'House wifi is FastNet');
    fireEvent.press(getByText('Household')); // Scope segmented button (admin-only)

    await act(async () => {
      fireEvent.press(getByTestId('memory-save-button'));
    });

    expect(createMemory).toHaveBeenCalledWith(
      'hh-1',
      expect.objectContaining({ scope: 'household', content: 'House wifi is FastNet' }),
    );
  });

  it('empty content gates the Save button (disabled until non-blank), and never calls the api', async () => {
    const { getByTestId } = renderScreen({});

    expect(getByTestId('memory-save-button').props.accessibilityState?.disabled).toBe(true);

    fireEvent.changeText(getByTestId('memory-content-input'), 'something');
    await waitFor(() =>
      expect(getByTestId('memory-save-button').props.accessibilityState?.disabled).toBe(false),
    );

    fireEvent.changeText(getByTestId('memory-content-input'), '   '); // whitespace only
    await waitFor(() =>
      expect(getByTestId('memory-save-button').props.accessibilityState?.disabled).toBe(true),
    );
    expect(createMemory).not.toHaveBeenCalled();
  });

  it('edit: prefills from getMemory, and Update calls updateMemory WITHOUT scope', async () => {
    const { getByTestId, findByDisplayValue, getByText, nav } = renderScreen({ memoryId: 7 });

    await findByDisplayValue('I prefer dark mode'); // loaded + prefilled
    expect(getMemory).toHaveBeenCalledWith(7, 'hh-1');

    fireEvent.changeText(getByTestId('memory-content-input'), 'I prefer light mode now');
    await act(async () => {
      fireEvent.press(getByText('Update'));
    });

    expect(updateMemory).toHaveBeenCalledWith(7, 'hh-1', {
      content: 'I prefer light mode now',
      category: 'preference',
      is_pinned: false,
    });
    // scope is not part of the update payload
    expect((updateMemory as jest.Mock).mock.calls[0][2]).not.toHaveProperty('scope');
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('edit: delete-action → Alert confirm → deleteMemory → goBack', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByTestId, findByDisplayValue, nav } = renderScreen({ memoryId: 7 });
    await findByDisplayValue('I prefer dark mode');

    fireEvent.press(getByTestId('memory-delete-button'));

    const buttons = alertSpy.mock.calls[0][2] as any[];
    const del = buttons.find((b) => b.text === 'Delete');
    await act(async () => {
      await del.onPress();
    });

    expect(deleteMemory).toHaveBeenCalledWith(7, 'hh-1');
    expect(nav.goBack).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('read-only (agent-injected) memory: banner shown, no Save, no delete action', async () => {
    (getMemory as jest.Mock).mockResolvedValue({ ...EXISTING, editable: false, source: 'agent' });
    const { findByText, queryByTestId } = renderScreen({ memoryId: 7 });

    await findByText('Read-only — agent-injected memory');
    expect(queryByTestId('memory-save-button')).toBeNull();
    expect(queryByTestId('memory-delete-button')).toBeNull();
  });
});
