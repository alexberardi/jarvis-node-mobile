import { renderHook, waitFor } from '@testing-library/react-native';

import { useNodeKinds } from '../../src/hooks/useNodeKinds';
import { listNodes } from '../../src/api/nodeApi';

// Pickers whose own API doesn't carry node_kind (the chat node selector's
// smart-home config, the command-data node list) look the kinds up from the
// node list once, so they can show the robot / Raspberry Pi icon.

jest.mock('../../src/api/nodeApi', () => ({ listNodes: jest.fn() }));
const mockList = listNodes as jest.Mock;

describe('useNodeKinds', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps node ids to their kind fields', async () => {
    mockList.mockResolvedValue([
      { node_id: 'pi-1', node_kind: null, install_mode: 'tarball' },
      { node_id: 'agent-1', node_kind: 'desktop', install_mode: 'desktop-agent' },
    ]);
    const { result } = renderHook(() => useNodeKinds('hh-1', ['pi-1', 'agent-1']));
    await waitFor(() => expect(result.current['agent-1']).toBeDefined());
    expect(mockList).toHaveBeenCalledWith('hh-1');
    expect(result.current['agent-1']).toEqual({ node_kind: 'desktop', install_mode: 'desktop-agent' });
    expect(result.current['pi-1']).toEqual({ node_kind: null, install_mode: 'tarball' });
  });

  it('does not refetch while every id is known', async () => {
    mockList.mockResolvedValue([{ node_id: 'pi-1', install_mode: 'tarball' }]);
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useNodeKinds('hh-1', ids),
      { initialProps: { ids: ['pi-1'] } },
    );
    await waitFor(() => expect(result.current['pi-1']).toBeDefined());
    rerender({ ids: ['pi-1'] });
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it('refetches when a node it has not seen appears', async () => {
    mockList.mockResolvedValueOnce([{ node_id: 'pi-1', install_mode: 'tarball' }]);
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useNodeKinds('hh-1', ids),
      { initialProps: { ids: ['pi-1'] } },
    );
    await waitFor(() => expect(result.current['pi-1']).toBeDefined());
    mockList.mockResolvedValueOnce([
      { node_id: 'pi-1', install_mode: 'tarball' },
      { node_id: 'agent-2', node_kind: 'desktop' },
    ]);
    rerender({ ids: ['pi-1', 'agent-2'] });
    await waitFor(() => expect(result.current['agent-2']).toBeDefined());
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('stays empty (Pi icons) when the lookup fails, and does nothing without ids', async () => {
    mockList.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useNodeKinds('hh-1', ['pi-1']));
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(result.current).toEqual({});

    mockList.mockClear();
    renderHook(() => useNodeKinds('hh-1', []));
    expect(mockList).not.toHaveBeenCalled();
  });
});
