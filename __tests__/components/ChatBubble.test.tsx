import React from 'react';
import { render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import ChatBubble from '../../src/components/ChatBubble';
import { lightTheme } from '../../src/theme';
import type { ChatMessage } from '../../src/api/chatApi';

jest.mock('react-native-markdown-display', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: string }) => <Text>{children}</Text>,
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'msg-1',
  role: 'assistant',
  content: 'Hello from Jarvis',
  timestamp: Date.now(),
  ...overrides,
});

describe('ChatBubble', () => {
  it('renders user message content', () => {
    const msg = makeMessage({ role: 'user', content: 'Hi there' });
    const { getByText } = render(
      <ChatBubble message={msg} />,
      { wrapper },
    );
    expect(getByText('Hi there')).toBeTruthy();
  });

  it('renders assistant message with "Jarvis" label', () => {
    const msg = makeMessage({ role: 'assistant', content: 'How can I help?' });
    const { getByText } = render(
      <ChatBubble message={msg} />,
      { wrapper },
    );
    expect(getByText('Jarvis')).toBeTruthy();
    expect(getByText('How can I help?')).toBeTruthy();
  });

  it('renders status message in italic style', () => {
    const msg = makeMessage({ role: 'status', content: 'Thinking...' });
    const { getByText } = render(
      <ChatBubble message={msg} />,
      { wrapper },
    );
    const statusText = getByText('Thinking...');
    expect(statusText).toBeTruthy();
    // The style is a deeply nested array; flatten and check for italic
    const flatStyle = JSON.stringify(statusText.props.style);
    expect(flatStyle).toContain('"fontStyle":"italic"');
  });

  it('strips think tags from assistant content', () => {
    const msg = makeMessage({
      role: 'assistant',
      content: '<think>internal reasoning</think>Visible answer',
    });
    const { getByText, queryByText } = render(
      <ChatBubble message={msg} />,
      { wrapper },
    );
    expect(getByText('Visible answer')).toBeTruthy();
    expect(queryByText('internal reasoning')).toBeNull();
  });

  it('shows TTS icon button for non-streaming assistant messages with onPlayTTS', () => {
    const onPlayTTS = jest.fn();
    const msg = makeMessage({ role: 'assistant', content: 'Answer text' });
    const { getByTestId } = render(
      <ChatBubble message={msg} isStreaming={false} onPlayTTS={onPlayTTS} />,
      { wrapper },
    );
    // Paper IconButton renders with testID="icon-button"
    expect(getByTestId('icon-button')).toBeTruthy();
  });

  it('hides TTS button while streaming', () => {
    const onPlayTTS = jest.fn();
    const msg = makeMessage({ role: 'assistant', content: 'Still typing...' });
    const { queryByTestId } = render(
      <ChatBubble message={msg} isStreaming={true} onPlayTTS={onPlayTTS} />,
      { wrapper },
    );
    expect(queryByTestId('icon-button')).toBeNull();
  });

  it('shows action buttons when message has actions', () => {
    const msg = makeMessage({
      role: 'assistant',
      content: 'Want to proceed?',
      actions: [
        { button_text: 'Yes', button_action: 'confirm', button_type: 'primary' },
        { button_text: 'No', button_action: 'cancel', button_type: 'secondary' },
      ],
      actionContext: { command_name: 'test_cmd', context: {} },
    });
    const { getByText } = render(
      <ChatBubble message={msg} isStreaming={false} onAction={jest.fn()} />,
      { wrapper },
    );
    expect(getByText('Yes')).toBeTruthy();
    expect(getByText('No')).toBeTruthy();
  });

  it('does not show TTS button when message has actions', () => {
    const onPlayTTS = jest.fn();
    const msg = makeMessage({
      role: 'assistant',
      content: 'Choose an option',
      actions: [
        { button_text: 'Ok', button_action: 'ok', button_type: 'primary' },
      ],
      actionContext: { command_name: 'test_cmd', context: {} },
    });
    const { queryByTestId } = render(
      <ChatBubble message={msg} isStreaming={false} onPlayTTS={onPlayTTS} onAction={jest.fn()} />,
      { wrapper },
    );
    // TTS icon-button should not be present when actions are shown
    expect(queryByTestId('icon-button')).toBeNull();
  });
});
