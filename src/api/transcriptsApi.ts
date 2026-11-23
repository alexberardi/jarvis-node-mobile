import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

export interface ToolCall {
  name: string;
  arguments?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Transcript {
  id: number;
  user_id: number;
  household_id: string;
  conversation_id: string;
  user_message: string;
  assistant_message: string | null;
  tool_calls: ToolCall[] | null;
  created_at: string;
  user_rating: -1 | 0 | 1 | null;
  rating_notes: string | null;
  rated_at: string | null;
}

export type Rating = -1 | 0 | 1;

const baseUrl = (): string => {
  const url = getCommandCenterUrl();
  if (!url) throw new Error('Command-center URL not configured');
  return url;
};

/**
 * jarvisd stores each call the way the model sent it: OpenAI-shaped
 * `{function: {name, arguments: "<json>"}}`, not the flat `{name, arguments}` the screens read.
 * Flatten either shape, parsing JSON arguments; a call with no name is dropped.
 */
export const flattenToolCalls = (raw: unknown): ToolCall[] | null => {
  if (!Array.isArray(raw)) return null;
  const out: ToolCall[] = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const fn = (c as { function?: unknown }).function;
    const src = (fn && typeof fn === 'object' ? fn : c) as { name?: unknown; arguments?: unknown };
    if (typeof src.name !== 'string' || !src.name) continue;
    let args = src.arguments;
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        args = { value: args };
      }
    }
    out.push({ name: src.name, arguments: args && typeof args === 'object' ? (args as Record<string, unknown>) : undefined });
  }
  return out;
};

export const listRecentTranscripts = async (
  params?: { limit?: number; since?: string },
): Promise<Transcript[]> => {
  const res = await apiClient.get<Transcript[]>(
    `${baseUrl()}/api/v0/transcripts/recent`,
    { params },
  );
  return res.data.map((t) => ({ ...t, tool_calls: flattenToolCalls(t.tool_calls) }));
};

export const rateTranscript = async (
  transcriptId: number,
  rating: Rating,
  notes?: string,
): Promise<Transcript> => {
  const res = await apiClient.post<Transcript>(
    `${baseUrl()}/api/v0/transcripts/${transcriptId}/rate`,
    { rating, notes },
  );
  return res.data;
};
