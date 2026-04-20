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

export const listRecentTranscripts = async (
  params?: { limit?: number; since?: string },
): Promise<Transcript[]> => {
  const res = await apiClient.get<Transcript[]>(
    `${baseUrl()}/api/v0/transcripts/recent`,
    { params },
  );
  return res.data;
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
