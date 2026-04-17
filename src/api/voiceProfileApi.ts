/**
 * Voice profile API — enrollment, verification, and status.
 *
 * Uses JWT-authenticated endpoints on command-center that proxy to
 * jarvis-whisper-api's voice profile management.
 */

import apiClient from './apiClient';
import { getCommandCenterUrl } from '../config/serviceConfig';

export interface VoiceProfileStatus {
  has_profile: boolean;
}

export interface VoiceProfileVerifyResult {
  matched: boolean;
  confidence: number;
}

export interface VoiceProfileEnrollResult {
  status: string;
  user_id: number;
  household_id: string;
}

/**
 * Check whether the current user has an enrolled voice profile.
 */
export const getVoiceProfileStatus = async (
  householdId: string,
): Promise<VoiceProfileStatus> => {
  const baseUrl = getCommandCenterUrl();
  const res = await apiClient.get<VoiceProfileStatus>(
    `${baseUrl}/api/v0/mobile/voice-profile/status`,
    { params: { household_id: householdId } },
  );
  return res.data;
};

/**
 * Upload a voice sample to enroll (or update) the user's voice profile.
 */
export const enrollVoiceProfile = async (
  audioUri: string,
  householdId: string,
): Promise<VoiceProfileEnrollResult> => {
  const baseUrl = getCommandCenterUrl();

  const formData = new FormData();
  formData.append('file', {
    uri: audioUri,
    type: 'audio/wav',
    name: 'enrollment.wav',
  } as unknown as Blob);
  formData.append('household_id', householdId);

  const res = await apiClient.post<VoiceProfileEnrollResult>(
    `${baseUrl}/api/v0/mobile/voice-profile/enroll`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    },
  );
  return res.data;
};

/**
 * Test whether an audio sample matches the user's enrolled profile.
 * Returns match result with confidence score (~150ms on the backend).
 */
export const verifyVoiceProfile = async (
  audioUri: string,
  householdId: string,
): Promise<VoiceProfileVerifyResult> => {
  const baseUrl = getCommandCenterUrl();

  const formData = new FormData();
  formData.append('file', {
    uri: audioUri,
    type: 'audio/wav',
    name: 'verify.wav',
  } as unknown as Blob);
  formData.append('household_id', householdId);

  const res = await apiClient.post<VoiceProfileVerifyResult>(
    `${baseUrl}/api/v0/mobile/voice-profile/verify`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    },
  );
  return res.data;
};

/**
 * Delete the current user's voice profile.
 */
export const deleteVoiceProfile = async (
  householdId: string,
): Promise<void> => {
  const baseUrl = getCommandCenterUrl();
  await apiClient.delete(`${baseUrl}/api/v0/mobile/voice-profile`, {
    params: { household_id: householdId },
  });
};
