import type { Message } from "@/api/messages";

type CoordinateFields = Pick<Message, "latitude" | "longitude">;

/** Compact sender coordinates for inbox rows. */
export function formatMessageCoordinatesLabel(
  message: CoordinateFields,
  options?: { missingLabel?: string; precision?: number },
): string {
  const precision = options?.precision ?? 4;
  const missing = options?.missingLabel ?? "No location";
  if (
    message.latitude != null &&
    message.longitude != null &&
    Number.isFinite(message.latitude) &&
    Number.isFinite(message.longitude)
  ) {
    return `${message.latitude.toFixed(precision)}, ${message.longitude.toFixed(precision)}`;
  }
  return missing;
}
