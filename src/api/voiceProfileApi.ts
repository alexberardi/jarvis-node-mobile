/**
 * Voice profile API — enrollment, verification, and status.
 *
 * Uses JWT-authenticated endpoints on command-center that proxy to
 * jarvis-whisper-api's voice profile management.
 */

import axios from 'axios';

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

// ---------------------------------------------------------------------------
// Node-mediated enrollment
//
// Phone-mic enrollment produces embeddings tied to the phone's acoustics.
// Recognition on a stationary node's mic then scores poorly because the
// mic + room characteristics don't match. This flow runs the recording
// ON the target node, so the same mic captures the sample at enrollment
// time as at runtime.
// ---------------------------------------------------------------------------

export interface StartNodeEnrollmentResponse {
  request_id: string;
}

export interface NodeEnrollmentResult {
  success: boolean;
  user_id?: number;
  duration_secs?: number;
  response?: VoiceProfileEnrollResult;
  error?: string;
}

/**
 * Trigger a node to record + enroll a voice sample using its own mic.
 * Returns a request_id; poll ``getNodeEnrollmentResult`` until the node
 * reports back.
 */
export const startNodeEnrollment = async (
  nodeId: string,
  promptText?: string,
  durationSecs?: number,
): Promise<StartNodeEnrollmentResponse> => {
  const baseUrl = getCommandCenterUrl();
  const res = await apiClient.post<StartNodeEnrollmentResponse>(
    `${baseUrl}/api/v0/mobile/voice-profile/start-node-enrollment`,
    {
      node_id: nodeId,
      prompt_text: promptText ?? '',
      duration_secs: durationSecs ?? 8.0,
    },
  );
  return res.data;
};

/**
 * Poll for the node's enrollment result. Returns null while pending
 * (CC responds 202), or the final result when the node has reported.
 */
export const getNodeEnrollmentResult = async (
  requestId: string,
): Promise<NodeEnrollmentResult | null> => {
  const baseUrl = getCommandCenterUrl();
  try {
    const res = await apiClient.get<NodeEnrollmentResult>(
      `${baseUrl}/api/v0/mobile/voice-profile-results/${requestId}`,
      { validateStatus: (s) => s === 200 || s === 202 },
    );
    if (res.status === 202) {
      return null;
    }
    return res.data;
  } catch (e) {
    // axios sometimes throws on 202 even with validateStatus; treat as pending
    if (axios.isAxiosError(e) && e.response?.status === 202) {
      return null;
    }
    throw e;
  }
};
