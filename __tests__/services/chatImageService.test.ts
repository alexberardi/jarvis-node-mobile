/**
 * chatImageService — picking chat images and preparing them for upload
 * (downscale to 1024px long edge, JPEG, step quality down to fit the limit).
 * Native modules are mocked globally in jest.setup.js.
 */
import * as ImageManipulatorModule from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import {
  base64DecodedBytes,
  ImagePermissionError,
  ImageTooLargeError,
  JPEG_QUALITY_STEPS,
  MAX_IMAGE_EDGE_PX,
  pickChatImages,
  prepareChatImage,
} from '../../src/services/chatImageService';

const manip = (ImageManipulatorModule as unknown as {
  __mock: { context: { resize: jest.Mock }; renderAsync: jest.Mock; saveAsync: jest.Mock };
}).__mock;
const manipulate = ImageManipulatorModule.ImageManipulator.manipulate as unknown as jest.Mock;

// n decoded bytes → base64 of that length (content irrelevant to the size check).
const b64OfBytes = (n: number) => 'A'.repeat(Math.ceil(n / 3) * 4);

beforeEach(() => {
  jest.clearAllMocks();
  manip.saveAsync.mockResolvedValue({ uri: 'file:///out.jpg', width: 1024, height: 768, base64: 'AAAA' });
  manip.renderAsync.mockResolvedValue({ width: 1024, height: 768, saveAsync: manip.saveAsync });
});

describe('base64DecodedBytes', () => {
  it('accounts for padding', () => {
    expect(base64DecodedBytes('')).toBe(0);
    expect(base64DecodedBytes('AAAA')).toBe(3);
    expect(base64DecodedBytes('AAA=')).toBe(2);
    expect(base64DecodedBytes('AA==')).toBe(1);
  });
});

describe('prepareChatImage', () => {
  it('downscales a landscape image to 1024 wide and returns a JPEG payload', async () => {
    const out = await prepareChatImage({ uri: 'file:///big.jpg', width: 4032, height: 3024 }, 2_097_152);

    expect(manipulate).toHaveBeenCalledWith('file:///big.jpg');
    expect(manip.context.resize).toHaveBeenCalledWith({ width: MAX_IMAGE_EDGE_PX });
    expect(manip.saveAsync).toHaveBeenCalledWith({
      compress: JPEG_QUALITY_STEPS[0],
      format: 'jpeg',
      base64: true,
    });
    expect(out).toEqual({ mime: 'image/jpeg', data: 'AAAA' });
  });

  it('caps the height of a portrait image', async () => {
    await prepareChatImage({ uri: 'file:///tall.jpg', width: 3024, height: 4032 }, 2_097_152);
    expect(manip.context.resize).toHaveBeenCalledWith({ height: MAX_IMAGE_EDGE_PX });
  });

  it('does not upscale an image already within 1024px', async () => {
    await prepareChatImage({ uri: 'file:///small.jpg', width: 800, height: 600 }, 2_097_152);
    expect(manip.context.resize).not.toHaveBeenCalled();
  });

  it('probes dimensions when the picker did not report them', async () => {
    manip.renderAsync.mockResolvedValueOnce({ width: 3000, height: 2000, saveAsync: manip.saveAsync });
    await prepareChatImage({ uri: 'file:///unknown.jpg', width: 0, height: 0 }, 2_097_152);
    expect(manip.context.resize).toHaveBeenCalledWith({ width: MAX_IMAGE_EDGE_PX });
  });

  it('lowers JPEG quality until the image fits under the byte limit', async () => {
    const limit = 1000;
    manip.saveAsync
      .mockResolvedValueOnce({ base64: b64OfBytes(5000) })
      .mockResolvedValueOnce({ base64: b64OfBytes(2000) })
      .mockResolvedValueOnce({ base64: b64OfBytes(900) });

    const out = await prepareChatImage({ uri: 'file:///x.jpg', width: 2000, height: 1000 }, limit);

    expect(manip.saveAsync.mock.calls.map((c) => c[0].compress)).toEqual(
      JPEG_QUALITY_STEPS.slice(0, 3),
    );
    expect(base64DecodedBytes(out.data)).toBeLessThanOrEqual(limit);
  });

  it('refuses with a clear error when even the lowest quality is too big', async () => {
    manip.saveAsync.mockResolvedValue({ base64: b64OfBytes(10_000) });
    await expect(
      prepareChatImage({ uri: 'file:///huge.jpg', width: 2000, height: 1000 }, 1000),
    ).rejects.toBeInstanceOf(ImageTooLargeError);
    expect(manip.saveAsync).toHaveBeenCalledTimes(JPEG_QUALITY_STEPS.length);
  });
});

describe('pickChatImages', () => {
  it('returns [] when the user cancels', async () => {
    await expect(pickChatImages('library', 4)).resolves.toEqual([]);
  });

  it('opens the library with multi-select limited to the remaining slots', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: 'file:///a.jpg', width: 10, height: 20 },
        { uri: 'file:///b.jpg', width: 30, height: 40 },
        { uri: 'file:///c.jpg', width: 50, height: 60 },
      ],
    });
    const out = await pickChatImages('library', 2);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 2 }),
    );
    expect(out).toEqual([
      { uri: 'file:///a.jpg', width: 10, height: 20 },
      { uri: 'file:///b.jpg', width: 30, height: 40 },
    ]);
  });

  it('asks for camera permission and launches the camera', async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///cam.jpg', width: 4000, height: 3000 }],
    });
    const out = await pickChatImages('camera', 4);
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled();
    expect(out).toEqual([{ uri: 'file:///cam.jpg', width: 4000, height: 3000 }]);
  });

  it('throws a permission error when the camera is denied', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
    await expect(pickChatImages('camera', 4)).rejects.toBeInstanceOf(ImagePermissionError);
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('does nothing with no slots left', async () => {
    await expect(pickChatImages('library', 0)).resolves.toEqual([]);
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });
});
