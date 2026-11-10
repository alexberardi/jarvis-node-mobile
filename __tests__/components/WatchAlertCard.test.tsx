import React from 'react';
import { Alert, Linking } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import WatchAlertCard from '../../src/components/inbox/WatchAlertCard';
import type { WatchAlertData } from '../../src/types/autonomyCards';
import { PaperWrapper as wrapper } from '../testUtils';

const makeData = (overrides: Partial<WatchAlertData> = {}): WatchAlertData => ({
  lookingFor: 'the price to drop below 100 on example.com',
  value: '$99',
  previous: '$129',
  checkedAt: '2026-10-16T14:00:00Z',
  sourceUrl: 'https://www.example.com/item',
  sourceLabel: 'example.com',
  state: 'active',
  ...overrides,
});

describe('WatchAlertCard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows what it watches for and the change', () => {
    const { getByTestId, getByText } = render(<WatchAlertCard data={makeData()} />, { wrapper });
    expect(getByTestId('watch-card')).toBeTruthy();
    expect(getByText('Watching for')).toBeTruthy();
    expect(getByText('the price to drop below 100 on example.com')).toBeTruthy();
    expect(getByTestId('watch-change')).toHaveTextContent('$129 → $99');
  });

  it('shows the value alone when previous is null', () => {
    const { getByTestId } = render(<WatchAlertCard data={makeData({ previous: null })} />, {
      wrapper,
    });
    expect(getByTestId('watch-change')).toHaveTextContent(/^\$99$/);
  });

  it('shows the value alone when previous equals it', () => {
    const { getByTestId } = render(<WatchAlertCard data={makeData({ previous: '$99' })} />, {
      wrapper,
    });
    expect(getByTestId('watch-change')).toHaveTextContent(/^\$99$/);
  });

  it('shows when it was checked', () => {
    const { getByText, queryByText, rerender } = render(<WatchAlertCard data={makeData()} />, {
      wrapper,
    });
    expect(getByText(/^Checked /)).toBeTruthy();
    rerender(<WatchAlertCard data={makeData({ checkedAt: null })} />);
    expect(queryByText(/^Checked /)).toBeNull();
  });

  it('opens the source URL', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { getByTestId, getByText } = render(<WatchAlertCard data={makeData()} />, { wrapper });
    expect(getByText('Open example.com')).toBeTruthy();
    fireEvent.press(getByTestId('watch-open-link'));
    expect(open).toHaveBeenCalledWith('https://www.example.com/item');
  });

  it('alerts when the link cannot be opened', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('nope'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByTestId } = render(<WatchAlertCard data={makeData()} />, { wrapper });
    fireEvent.press(getByTestId('watch-open-link'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Error', 'Could not open the link.'));
  });

  it('shows no link button without a URL', () => {
    const { queryByTestId } = render(<WatchAlertCard data={makeData({ sourceUrl: null })} />, {
      wrapper,
    });
    expect(queryByTestId('watch-open-link')).toBeNull();
  });

  it('shows Stopped when done and Paused when paused, nothing when active', () => {
    const { getByText, queryByText, rerender } = render(
      <WatchAlertCard data={makeData({ state: 'done' })} />,
      { wrapper },
    );
    expect(getByText('Stopped')).toBeTruthy();
    rerender(<WatchAlertCard data={makeData({ state: 'paused' })} />);
    expect(getByText('Paused')).toBeTruthy();
    rerender(<WatchAlertCard data={makeData()} />);
    expect(queryByText('Stopped')).toBeNull();
    expect(queryByText('Paused')).toBeNull();
  });
});
