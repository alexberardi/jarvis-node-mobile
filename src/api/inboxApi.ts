import axios from 'axios';

import { getServiceConfig } from '../config/serviceConfig';

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
  accessToken: string,
  params?: { category?: string; is_read?: boolean; limit?: number; offset?: number },
): Promise<InboxItem[]> => {
  const res = await axios.get<InboxItem[]>(`${getBaseUrl()}/api/v0/inbox`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params,
    timeout: 10000,
  });
  return res.data;
};

export const getInboxItem = async (
  accessToken: string,
  itemId: string,
): Promise<InboxItem> => {
  const res = await axios.get<InboxItem>(`${getBaseUrl()}/api/v0/inbox/${itemId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 10000,
  });
  return res.data;
};

export const getUnreadCount = async (
  accessToken: string,
): Promise<number> => {
  const res = await axios.get<UnreadCountResponse>(
    `${getBaseUrl()}/api/v0/inbox/unread-count`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000,
    },
  );
  return res.data.count;
};

export const markItemRead = async (
  accessToken: string,
  itemId: string,
): Promise<void> => {
  await axios.patch(
    `${getBaseUrl()}/api/v0/inbox/${itemId}/read`,
    {},
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000,
    },
  );
};

export const deleteInboxItem = async (
  accessToken: string,
  itemId: string,
): Promise<void> => {
  await axios.delete(`${getBaseUrl()}/api/v0/inbox/${itemId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 10000,
  });
};
