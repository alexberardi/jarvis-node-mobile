/**
 * Chat image attachments: picking (camera / photo library) and preparing an
 * image for upload (downscale + JPEG-compress until it fits the server limit).
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { ChatImagePayload } from '../api/chatApi';

/** An image the user picked but hasn't sent yet. */
export interface PendingChatImage {
  uri: string;
  width: number;
  height: number;
}

/** Long-edge cap applied before upload. */
export const MAX_IMAGE_EDGE_PX = 1024;

/** JPEG qualities tried in order until the image fits under the byte limit. */
export const JPEG_QUALITY_STEPS = [0.8, 0.6, 0.4, 0.25] as const;

export type PickSource = 'camera' | 'library';

export class ImageTooLargeError extends Error {
  constructor() {
    super('This image is too large to send, even after compressing it. Try a different photo.');
    this.name = 'ImageTooLargeError';
  }
}

export class ImagePermissionError extends Error {
  constructor(source: PickSource) {
    super(
      source === 'camera'
        ? 'Camera access is off for Jarvis. Enable it in system settings to take a photo.'
        : 'Photo access is off for Jarvis. Enable it in system settings to choose a photo.',
    );
    this.name = 'ImagePermissionError';
  }
}

/** Decoded byte length of a base64 string (no data: prefix). */
export function base64DecodedBytes(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

/**
 * Let the user pick up to `limit` images. Returns [] on cancel.
 * Throws ImagePermissionError when the camera permission is denied.
 */
export async function pickChatImages(
  source: PickSource,
  limit: number,
): Promise<PendingChatImage[]> {
  if (limit <= 0) return [];

  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new ImagePermissionError('camera');
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  } else {
    // The system photo picker needs no runtime permission (and asking for full
    // library access would show an unnecessary prompt on iOS).
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: limit > 1,
      selectionLimit: limit,
      quality: 1,
    });
  }

  if (result.canceled || !result.assets) return [];
  return result.assets.slice(0, limit).map((a) => ({
    uri: a.uri,
    width: a.width,
    height: a.height,
  }));
}

/**
 * Downscale to MAX_IMAGE_EDGE_PX on the long edge and JPEG-compress, stepping
 * quality down until the decoded size is at most `maxBytes`.
 * Throws ImageTooLargeError when even the lowest quality is too big.
 */
export async function prepareChatImage(
  image: PendingChatImage,
  maxBytes: number,
): Promise<ChatImagePayload> {
  let { width, height } = image;
  if (!width || !height) {
    // Picker didn't report dimensions — read them from a decoded copy.
    const probe = await ImageManipulator.manipulate(image.uri).renderAsync();
    width = probe.width;
    height = probe.height;
  }

  const ctx = ImageManipulator.manipulate(image.uri);
  if (Math.max(width, height) > MAX_IMAGE_EDGE_PX) {
    ctx.resize(width >= height ? { width: MAX_IMAGE_EDGE_PX } : { height: MAX_IMAGE_EDGE_PX });
  }
  const rendered = await ctx.renderAsync();

  for (const compress of JPEG_QUALITY_STEPS) {
    const saved = await rendered.saveAsync({ compress, format: SaveFormat.JPEG, base64: true });
    const data = saved.base64 ?? '';
    if (data && base64DecodedBytes(data) <= maxBytes) {
      return { mime: 'image/jpeg', data };
    }
  }
  throw new ImageTooLargeError();
}
