import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

export interface CameraInfo {
  device_id: string;
  entity_id: string;
  name: string;
  protocol: string | null;
  cloud_id: string | null;
  room_name: string | null;
  is_streaming: boolean;
}

export interface StartStreamParams {
  protocols?: string;
}

export interface StartStreamResponse {
  stream_name: string;
  hls_url: string;
}

export const listCameras = async (householdId: string): Promise<CameraInfo[]> => {
  const res = await apiClient.get<CameraInfo[]>(
    `${getCommandCenterUrl()}/api/v0/households/${householdId}/cameras`,
  );
  return res.data;
};

export const startCameraStream = async (
  householdId: string,
  deviceId: string,
  params?: StartStreamParams,
): Promise<StartStreamResponse> => {
  const res = await apiClient.post<StartStreamResponse>(
    `${getCommandCenterUrl()}/api/v0/households/${householdId}/cameras/${deviceId}/stream`,
    params ?? {},
    { timeout: 20000 }, // 20s: 10s MQTT credential fetch + go2rtc registration
  );
  return res.data;
};

export const stopCameraStream = async (
  householdId: string,
  deviceId: string,
): Promise<void> => {
  await apiClient.delete(
    `${getCommandCenterUrl()}/api/v0/households/${householdId}/cameras/${deviceId}/stream`,
  );
};

export const getCameraStreamUrl = (streamName: string, path: string): string => {
  return `${getCommandCenterUrl()}/api/v0/cameras/stream/${streamName}/${path}`;
};
