import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';

import InteractiveElementsSection from '../../src/components/InteractiveElementsSection';
import { sendInteractiveCallback, InteractiveElement } from '../../src/api/commandCenterApi';
import { lightTheme } from '../../src/theme';

const mockPush = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ push: mockPush, goBack: jest.fn(), navigate: jest.fn() }),
  };
});

jest.mock('../../src/api/commandCenterApi', () => ({
  ...jest.requireActual('../../src/api/commandCenterApi'),
  sendInteractiveCallback: jest.fn(),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>
    <NavigationContainer>{children}</NavigationContainer>
  </PaperProvider>
);

const el = (overrides: Partial<InteractiveElement> = {}): InteractiveElement => ({
  id: 'el-1',
  label: 'Tom Hanks',
  kind: 'actor',
  command: 'movie_knowledge',
  callback: 'expand_actor',
  data: { actor_id: 'nm0000158' },
  ...overrides,
});

describe('InteractiveElementsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('renders nothing for empty array', () => {
    const { queryByText } = render(
      <InteractiveElementsSection elements={[]} targetNodeId="n1" />,
      { wrapper },
    );
    expect(queryByText('Tom Hanks')).toBeNull();
  });

  it('renders each element label', () => {
    const { getByText } = render(
      <InteractiveElementsSection
        elements={[el({ id: 'a', label: 'Tom Hanks' }), el({ id: 'b', label: 'Robin Wright' })]}
        targetNodeId="n1"
      />,
      { wrapper },
    );
    expect(getByText('Tom Hanks')).toBeTruthy();
    expect(getByText('Robin Wright')).toBeTruthy();
  });

  it('renders sublabel joined to label when present', () => {
    const { getByText } = render(
      <InteractiveElementsSection
        elements={[el({ label: 'Tom Hanks', sublabel: 'as Forrest Gump' })]}
        targetNodeId="n1"
      />,
      { wrapper },
    );
    expect(getByText('Tom Hanks · as Forrest Gump')).toBeTruthy();
  });

  it('renders the section title when provided', () => {
    const { getByText } = render(
      <InteractiveElementsSection
        elements={[el()]}
        targetNodeId="n1"
        title="Cast"
      />,
      { wrapper },
    );
    expect(getByText('Cast')).toBeTruthy();
  });

  it('POSTs the callback with the right payload on tap', async () => {
    (sendInteractiveCallback as jest.Mock).mockResolvedValue({
      id: 'job-1', status: 'pending', navigation_type: 'new_notification', created_at: 'x',
    });
    const { getByText } = render(
      <InteractiveElementsSection
        elements={[el({ label: 'Tom Hanks', data: { actor_id: 'nm158' } })]}
        targetNodeId="node-abc"
      />,
      { wrapper },
    );

    fireEvent.press(getByText('Tom Hanks'));

    await waitFor(() => {
      expect(sendInteractiveCallback).toHaveBeenCalledTimes(1);
    });
    // navigation_type defaults to "new_notification" when the element doesn't set one.
    expect(sendInteractiveCallback).toHaveBeenCalledWith({
      command_name: 'movie_knowledge',
      callback_name: 'expand_actor',
      data: { actor_id: 'nm158' },
      target_node_id: 'node-abc',
      navigation_type: 'new_notification',
    });
    // "new_notification" mode doesn't navigate anywhere.
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('pushes InboxCallbackResult when navigation_type is "stack"', async () => {
    (sendInteractiveCallback as jest.Mock).mockResolvedValue({
      id: 'job-xyz', status: 'pending', navigation_type: 'stack', created_at: 'x',
    });
    const { getByText } = render(
      <InteractiveElementsSection
        elements={[el({
          label: 'Keanu Reeves',
          data: { actor_id: 6384 },
          navigation_type: 'stack',
        })]}
        targetNodeId="node-abc"
      />,
      { wrapper },
    );

    fireEvent.press(getByText('Keanu Reeves'));

    await waitFor(() => {
      expect(sendInteractiveCallback).toHaveBeenCalledTimes(1);
    });
    expect(sendInteractiveCallback).toHaveBeenCalledWith(
      expect.objectContaining({ navigation_type: 'stack' }),
    );
    // Stack mode navigates immediately, passing job id + label for the spinner caption.
    expect(mockPush).toHaveBeenCalledWith('InboxCallbackResult', {
      jobId: 'job-xyz',
      title: 'Keanu Reeves',
      targetNodeId: 'node-abc',
    });
  });

  it('alerts and does not POST when targetNodeId is null', () => {
    const { getByText } = render(
      <InteractiveElementsSection
        elements={[el({ label: 'Tom Hanks' })]}
        targetNodeId={null}
      />,
      { wrapper },
    );

    fireEvent.press(getByText('Tom Hanks'));
    expect(sendInteractiveCallback).not.toHaveBeenCalled();
  });

  it('alerts on API error and stays tappable', async () => {
    (sendInteractiveCallback as jest.Mock).mockRejectedValue(new Error('boom'));
    const { getByText } = render(
      <InteractiveElementsSection
        elements={[el({ label: 'Tom Hanks' })]}
        targetNodeId="node-abc"
      />,
      { wrapper },
    );

    fireEvent.press(getByText('Tom Hanks'));
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Could not send', 'boom');
    });
  });
});
