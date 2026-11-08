/** Public username rules shared with the server (`username_service`). */

export const USERNAME_PATTERN = /^[a-z0-9_]+$/;
export const USERNAME_MIN_LEN = 3;
export const USERNAME_MAX_LEN = 64;
export const USERNAME_INFO_MESSAGE =
  "Username may only contain lowercase letters, numbers, and underscores.";

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/** Returns an info/error message when invalid; otherwise null. */
export function validateUsernameFormat(username: string): string | null {
  const value = username.trim();
  if (!value) return "Username is required.";
  if (value !== value.toLowerCase() || !USERNAME_PATTERN.test(value)) {
    return USERNAME_INFO_MESSAGE;
  }
  if (value.length < USERNAME_MIN_LEN) {
    return `Username must be at least ${USERNAME_MIN_LEN} characters.`;
  }
  if (value.length > USERNAME_MAX_LEN) {
    return `Username must be at most ${USERNAME_MAX_LEN} characters.`;
  }
  return null;
}
