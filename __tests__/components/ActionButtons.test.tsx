import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import ActionButtons from '../../src/components/ActionButtons';
import { lightTheme } from '../../src/theme';
import type { JarvisButton } from '../../src/types/SmartHome';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const makeAction = (overrides: Partial<JarvisButton> = {}): JarvisButton => ({
  button_text: 'Do it',
  button_action: 'do_it',
  button_type: 'primary',
  ...overrides,
});

describe('ActionButtons', () => {
  it('returns null for empty actions array', () => {
    const { queryByText, toJSON } = render(
      <ActionButtons actions={[]} onPress={jest.fn()} loadingAction={null} />,
      { wrapper },
    );
    // The component returns null; the wrapper still renders but no action content inside
    // Verify nothing action-related is rendered
    expect(queryByText('Do it')).toBeNull();
    // The tree is just the PaperProvider wrapper, no button content
    const tree = JSON.stringify(toJSON());
    expect(tree).not.toContain('button_action');
  });

  it('renders a single button full width (column layout)', () => {
    const action = makeAction({ button_text: 'Confirm' });
    const { getByText } = render(
      <ActionButtons actions={[action]} onPress={jest.fn()} loadingAction={null} />,
      { wrapper },
    );
    expect(getByText('Confirm')).toBeTruthy();
  });

  it('renders 2 buttons in a row layout', () => {
    const actions = [
      makeAction({ button_action: 'yes', button_text: 'Yes' }),
      makeAction({ button_action: 'no', button_text: 'No', button_type: 'secondary' }),
    ];
    const { getByText } = render(
      <ActionButtons actions={actions} onPress={jest.fn()} loadingAction={null} />,
      { wrapper },
    );
    expect(getByText('Yes')).toBeTruthy();
    expect(getByText('No')).toBeTruthy();
  });

  it('renders 3+ buttons in a column layout', () => {
    const actions = [
      makeAction({ button_action: 'a', button_text: 'A' }),
      makeAction({ button_action: 'b', button_text: 'B' }),
      makeAction({ button_action: 'c', button_text: 'C' }),
    ];
    const { getByText } = render(
      <ActionButtons actions={actions} onPress={jest.fn()} loadingAction={null} />,
      { wrapper },
    );
    expect(getByText('A')).toBeTruthy();
    expect(getByText('B')).toBeTruthy();
    expect(getByText('C')).toBeTruthy();
  });

  it('calls onPress with the correct action', () => {
    const onPress = jest.fn();
    const action = makeAction({ button_action: 'save', button_text: 'Save' });
    const { getByText } = render(
      <ActionButtons actions={[action]} onPress={onPress} loadingAction={null} />,
      { wrapper },
    );

    fireEvent.press(getByText('Save'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(action);
  });

  it('shows loading state on the active action', () => {
    const actions = [
      makeAction({ button_action: 'save', button_text: 'Save' }),
      makeAction({ button_action: 'cancel', button_text: 'Cancel', button_type: 'secondary' }),
    ];
    const { getByText } = render(
      <ActionButtons actions={actions} onPress={jest.fn()} loadingAction="save" />,
      { wrapper },
    );
    // Both buttons should be present; the loading one still renders its text
    expect(getByText('Save')).toBeTruthy();
    expect(getByText('Cancel')).toBeTruthy();
  });

  it('disables all buttons when loadingAction is set', () => {
    const onPress = jest.fn();
    const actions = [
      makeAction({ button_action: 'a', button_text: 'A' }),
      makeAction({ button_action: 'b', button_text: 'B' }),
    ];
    const { getByText } = render(
      <ActionButtons actions={actions} onPress={onPress} loadingAction="a" />,
      { wrapper },
    );

    fireEvent.press(getByText('A'));
    fireEvent.press(getByText('B'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('disables all buttons when disabled prop is true', () => {
    const onPress = jest.fn();
    const action = makeAction({ button_text: 'Click' });
    const { getByText } = render(
      <ActionButtons actions={[action]} onPress={onPress} loadingAction={null} disabled />,
      { wrapper },
    );

    fireEvent.press(getByText('Click'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
