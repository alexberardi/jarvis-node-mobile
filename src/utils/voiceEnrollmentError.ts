import type { NodeEnrollmentResult } from '../api/voiceProfileApi';

export function voiceEnrollmentError(result: NodeEnrollmentResult): string {
  if (result.error === 'audio_bus_unavailable') {
    return 'Turn on voice listening on this device and check its microphone, then try again.';
  }
  if (result.error !== 'low_quality') {
    return `Enrollment failed: ${result.error || 'unknown error'}`;
  }
  switch (result.reason) {
    case 'too_little_speech': {
      const speech = result.speech_seconds;
      const minimum = result.min_speech_seconds;
      if (typeof speech === 'number' && Number.isFinite(speech) && speech >= 0 &&
          typeof minimum === 'number' && Number.isFinite(minimum) && minimum > 0) {
        return `Only ${speech.toFixed(1)} seconds of speech were detected; at least ${minimum.toFixed(1)} seconds are needed. Read the whole prompt after the cue, close to the selected microphone.`;
      }
      return 'Not enough clear speech was detected. Read the whole prompt after the cue, close to the selected microphone.';
    }
    case 'inconsistent':
      return 'This take did not match your existing voice samples. Make sure only you are speaking, then try again.';
    case 'too_short':
      return 'The recording was too short to identify your voice. Read the whole prompt after the cue.';
    default:
      return 'This recording could not be used. Try the prompt again on the selected microphone.';
  }
}
