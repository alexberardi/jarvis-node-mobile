import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import SendToForgeCard from '../../src/screens/Store/SendToForgeCard';
import { lightTheme } from '../../src/theme';
import { fetchTestRuns, sendToForge } from '../../src/api/testInstallApi';

jest.mock('../../src/api/testInstallApi', () => ({
  fetchTestRuns: jest.fn(),
  sendToForge: jest.fn(),
}));

const mockFetch = fetchTestRuns as jest.Mock;
const mockSend = sendToForge as jest.Mock;

const renderCard = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <SendToForgeCard nodeId="node-1" requestId="req-A" />
    </PaperProvider>,
  );

describe('SendToForgeCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('previews the runs, a failed one by its error', async () => {
    mockFetch.mockResolvedValue([
      { command: 'days_until_date', arguments: { target: 'Christmas' }, at: 't',
        output: { success: false, error: "'timedelta' object has no attribute 'day'", message: 'Sorry' } },
      { command: 'days_until_date', arguments: {}, at: 't', output: { success: true, message: '47 days' } },
    ]);
    const { findByText, getByText } = renderCard();
    expect(await findByText("'timedelta' object has no attribute 'day'")).toBeTruthy();
    expect(getByText('days_until_date failed')).toBeTruthy();
    expect(getByText('47 days')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledWith('node-1', 'req-A');
  });

  it('sends the note and says where to go next', async () => {
    mockFetch.mockResolvedValue([]);
    mockSend.mockResolvedValue(undefined);
    const { getByTestId, findByText } = renderCard();
    await findByText('No runs yet.');
    fireEvent.changeText(getByTestId('send-to-forge-note'), 'it apologised');
    fireEvent.press(getByTestId('send-to-forge-button'));
    expect(await findByText('Sent. Open the Forge to fix it with this report.')).toBeTruthy();
    expect(mockSend).toHaveBeenCalledWith('node-1', 'req-A', 'it apologised');
  });

  it("shows jarvisd's reason when the send fails", async () => {
    mockFetch.mockResolvedValue([]);
    mockSend.mockRejectedValue({ response: { data: { detail: 'The Forge draft is gone' } } });
    const { getByTestId, findByText } = renderCard();
    fireEvent.press(getByTestId('send-to-forge-button'));
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    expect(await findByText('The Forge draft is gone')).toBeTruthy();
  });
});
