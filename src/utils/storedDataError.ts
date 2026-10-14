/**
 * The error line for the Stored Data browser (command-data over MQTT).
 *
 * cc waits 10 s for the node and answers 504; the app's HTTP client also
 * gives up at 10 s (an axios `ECONNABORTED` with no response), whichever
 * comes first. Both mean the node didn't answer. A computer is often just
 * asleep, or runs an agent that can't answer stored-data requests yet.
 */
export const storedDataErrorMessage = (
  err: unknown,
  desktop: boolean,
  fallback: string,
): string => {
  const e = err as { response?: { status?: number }; code?: string } | null | undefined;
  const noAnswer = e?.response?.status === 504 || (!e?.response && e?.code === 'ECONNABORTED');
  if (!noAnswer) return fallback;
  return desktop
    ? "This computer didn't answer. It may be asleep or offline, or its Jarvis Automation agent may need an update to show stored data."
    : 'Node did not respond. It may be offline.';
};
