import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import ErrorBoundary from '../../src/components/ErrorBoundary';

// Throws on render while `throwError` is true; renders normally otherwise.
function Boom({ throwError }: { throwError: boolean }) {
  if (throwError) {
    throw new Error('boom');
  }
  return <Text>Recovered child</Text>;
}

describe('ErrorBoundary', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    // React logs caught render errors via console.error; silence for clean output.
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('renders children when there is no error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Text>Healthy child</Text>
      </ErrorBoundary>,
    );
    expect(getByText('Healthy child')).toBeTruthy();
  });

  it('renders a recoverable fallback when a child throws', () => {
    const { getByText, queryByText } = render(
      <ErrorBoundary>
        <Boom throwError />
      </ErrorBoundary>,
    );
    expect(getByText('Something went wrong')).toBeTruthy();
    expect(getByText('Try Again')).toBeTruthy();
    expect(queryByText('Recovered child')).toBeNull();
  });

  it('re-mounts children when "Try Again" is pressed', () => {
    const { getByText, queryByText, rerender } = render(
      <ErrorBoundary>
        <Boom throwError />
      </ErrorBoundary>,
    );
    expect(getByText('Something went wrong')).toBeTruthy();

    // Underlying problem clears, then the user taps Try Again.
    rerender(
      <ErrorBoundary>
        <Boom throwError={false} />
      </ErrorBoundary>,
    );
    fireEvent.press(getByText('Try Again'));

    expect(queryByText('Something went wrong')).toBeNull();
    expect(getByText('Recovered child')).toBeTruthy();
  });
});
