/**
 * transcriptsApi.listRecentTranscripts — jarvisd stores tool calls OpenAI-shaped
 * ({function: {name, arguments: "<json>"}}); the screens read a flat {name, arguments}.
 * Without flattening, the list showed "tool" and the detail "undefined".
 */
import apiClient from '../../src/api/apiClient';
import { flattenToolCalls, listRecentTranscripts } from '../../src/api/transcriptsApi';

jest.mock('../../src/config/serviceConfig', () => ({
  getCommandCenterUrl: () => 'http://cc.test',
}));

jest.mock('../../src/api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const mockGet = (apiClient as unknown as { get: jest.Mock }).get;

it('flattens the stored OpenAI shape and parses its JSON arguments', async () => {
  mockGet.mockResolvedValue({
    data: [
      {
        id: 1,
        user_message: 'add milk',
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'shopping_list', arguments: '{"action":"add","items":["milk"]}' } }],
      },
    ],
  });
  const [t] = await listRecentTranscripts({ limit: 5 });
  expect(mockGet).toHaveBeenCalledWith('http://cc.test/api/v0/transcripts/recent', { params: { limit: 5 } });
  expect(t.tool_calls).toEqual([{ name: 'shopping_list', arguments: { action: 'add', items: ['milk'] } }]);
});

it('keeps the flat shape, drops nameless calls and wraps unparseable arguments', () => {
  expect(
    flattenToolCalls([
      { name: 'set_timer', arguments: { minutes: 5 } },
      { function: { arguments: '{}' } },
      { function: { name: 'remember', arguments: 'not json' } },
    ]),
  ).toEqual([
    { name: 'set_timer', arguments: { minutes: 5 } },
    { name: 'remember', arguments: { value: 'not json' } },
  ]);
  expect(flattenToolCalls(null)).toBeNull();
});
