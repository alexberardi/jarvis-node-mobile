import { getServiceConfig } from '../config/serviceConfig';
import apiClient from './apiClient';

export interface InboxItem {
  id: string;
  user_id: number | null;
  household_id: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  source_service: string;
  metadata: Record<string, any> | null;
  content_format: 'markdown' | 'html' | 'plain' | null;
  is_read: boolean;
  created_at: string;
}

export interface UnreadCountResponse {
  count: number;
}

const getBaseUrl = () => {
  const { notificationsUrl } = getServiceConfig();
  if (!notificationsUrl) {
    throw new Error('Notifications service URL not configured');
  }
  return notificationsUrl;
};

export const listInboxItems = async (
  params?: { category?: string; is_read?: boolean; limit?: number; offset?: number },
): Promise<InboxItem[]> => {
  const res = await apiClient.get<InboxItem[]>(`${getBaseUrl()}/api/v0/inbox`, {
    params,
  });
  return res.data;
};

export const getInboxItem = async (
  itemId: string,
): Promise<InboxItem> => {
  const res = await apiClient.get<InboxItem>(`${getBaseUrl()}/api/v0/inbox/${itemId}`);
  return res.data;
};

export const getUnreadCount = async (): Promise<number> => {
  const res = await apiClient.get<UnreadCountResponse>(
    `${getBaseUrl()}/api/v0/inbox/unread-count`,
  );
  return res.data.count;
};

export const markItemRead = async (
  itemId: string,
): Promise<void> => {
  await apiClient.patch(
    `${getBaseUrl()}/api/v0/inbox/${itemId}/read`,
    {},
  );
};

export const deleteInboxItem = async (
  itemId: string,
): Promise<void> => {
  await apiClient.delete(`${getBaseUrl()}/api/v0/inbox/${itemId}`);
};
