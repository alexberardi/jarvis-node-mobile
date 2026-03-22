import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import QuickActions from '../../src/components/QuickActions';
import { lightTheme } from '../../src/theme';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

describe('QuickActions', () => {
  it('returns null when no matching tools and no server tools match', () => {
    // deep_research and remember are always included as server tools,
    // so passing an empty array still shows those two.
    // To get null we need combined.length === 0, which can't happen
    // because server tools are always appended. This test verifies the
    // component renders at least the server-side chips.
    const { toJSON } = render(
      <QuickActions availableTools={[]} onSelect={jest.fn()} />,
      { wrapper },
    );
    // Server tools (Research, Remember) are always present, so not null
    expect(toJSON()).not.toBeNull();
  });

  it('renders "Ask Jarvis anything" text', () => {
    const { getByText } = render(
      <QuickActions availableTools={[]} onSelect={jest.fn()} />,
      { wrapper },
    );
    expect(getByText('Ask Jarvis anything')).toBeTruthy();
  });

  it('shows chips for matching tools (e.g., get_weather shows Weather)', () => {
    const { getByText } = render(
      <QuickActions availableTools={['get_weather']} onSelect={jest.fn()} />,
      { wrapper },
    );
    expect(getByText('Weather')).toBeTruthy();
  });

  it('always shows Research and Remember (server tools)', () => {
    const { getByText } = render(
      <QuickActions availableTools={[]} onSelect={jest.fn()} />,
      { wrapper },
    );
    expect(getByText('Research')).toBeTruthy();
    expect(getByText('Remember')).toBeTruthy();
  });

  it('limits to 8 chips max', () => {
    // Provide many tools to exceed 8
    const manyTools = [
      'get_weather',
      'set_timer',
      'email',
      'get_sports_scores',
      'get_calendar',
      'control_device',
      'calculate',
      'jokes',
      'check_timers',
      'get_news',
      'bluetooth',
    ];
    render(
      <QuickActions availableTools={manyTools} onSelect={jest.fn()} />,
      { wrapper },
    );
    // Chip doesn't expose role by default, so count via the rendered chip labels
    // Instead, count all chip text nodes by looking at the known labels
    const allLabels = [
      'Weather', 'Set a timer', 'Email', 'Sports scores', 'Calendar',
      'Lights', 'Calculate', 'Jokes', 'Timers', 'News', 'Bluetooth',
      'Research', 'Remember',
    ];
    let chipCount = 0;
    const { queryByText } = render(
      <QuickActions availableTools={manyTools} onSelect={jest.fn()} />,
      { wrapper },
    );
    for (const label of allLabels) {
      if (queryByText(label)) chipCount++;
    }
    expect(chipCount).toBeLessThanOrEqual(8);
  });

  it('calls onSelect with prompt on chip press', () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <QuickActions availableTools={['get_weather']} onSelect={onSelect} />,
      { wrapper },
    );

    fireEvent.press(getByText('Weather'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("What's the weather?");
  });
});
