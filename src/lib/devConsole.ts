/** Prefix app console output so it is easy to spot in Metro / adb logcat. */
const PREFIX = "[ZoneWeaver]";

export function devLog(label: string, payload?: unknown) {
  if (!__DEV__) return;
  if (payload === undefined) {
    console.log(`${PREFIX} ${label}`);
    return;
  }
  console.log(`${PREFIX} ${label}`, payload);
}

export function devWarn(label: string, payload?: unknown) {
  if (!__DEV__) return;
  if (payload === undefined) {
    console.warn(`${PREFIX} ${label}`);
    return;
  }
  console.warn(`${PREFIX} ${label}`, payload);
}

export function devError(label: string, payload?: unknown) {
  if (!__DEV__) return;
  if (payload === undefined) {
    console.error(`${PREFIX} ${label}`);
    return;
  }
  console.error(`${PREFIX} ${label}`, payload);
}
