export type PrivateLocationStatus =
  | "inside_zone"
  | "outside_zone"
  | "no_coordinates"
  | "not_in_network";

const MESSAGE_POSITION_REQUIRED =
  "No location available. Allow location access, or set your address on your account so we can use it as a fallback.";

export function privateLocationStatusMessage(
  status: PrivateLocationStatus | null | undefined,
): string | null {
  switch (status) {
    case "not_in_network":
      return (
        "You are not in a network. Join with an invite link, or scan the network access QR " +
        "to send safety alerts as a guest."
      );
    case "no_coordinates":
      return MESSAGE_POSITION_REQUIRED;
    case "outside_zone":
      return (
        "You are not inside an acceptable zone. Move into a primary or secondary zone, " +
        "or update your location before sending a private message."
      );
    default:
      return null;
  }
}
