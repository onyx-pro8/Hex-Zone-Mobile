import type { Message } from "@/api/messages";

type CoordinateFields = Pick<Message, "latitude" | "longitude">;

export function hasMessageCoordinates(message: CoordinateFields): boolean {
  return (
    message.latitude != null &&
    message.longitude != null &&
    Number.isFinite(message.latitude) &&
    Number.isFinite(message.longitude)
  );
}

/** Compact sender coordinates for inbox rows. */
export function formatMessageCoordinatesLabel(
  message: CoordinateFields,
  options?: { missingLabel?: string; precision?: number },
): string {
  const precision = options?.precision ?? 4;
  const missing = options?.missingLabel ?? "No location";
  if (hasMessageCoordinates(message)) {
    return `${message.latitude!.toFixed(precision)}, ${message.longitude!.toFixed(precision)}`;
  }
  return missing;
}

/** Google Maps link when sender coordinates are available. */
export function messageCoordinatesMapsUrl(message: CoordinateFields): string | null {
  if (!hasMessageCoordinates(message)) return null;
  return `https://www.google.com/maps?q=${message.latitude},${message.longitude}`;
}
