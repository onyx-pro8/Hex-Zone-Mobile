export type NormalizedAccountType =
  | "PRIVATE"
  | "EXCLUSIVE"
  | "PRIVATE_PLUS"
  | "ENHANCED"
  | "ENHANCED_PLUS";

export function normalizeAccountType(
  accountType?: string | null,
  legacyAccountType?: string | null,
): NormalizedAccountType {
  const upper = String(accountType ?? legacyAccountType ?? "")
    .trim()
    .toUpperCase();
  if (upper === "EXCLUSIVE") return "EXCLUSIVE";
  if (upper === "PRIVATE_PLUS" || upper === "PRIVATE+" || upper === "PRIVATEPLUS") {
    return "PRIVATE_PLUS";
  }
  if (upper === "ENHANCED") return "ENHANCED";
  if (
    upper === "ENHANCED_PLUS" ||
    upper === "ENHANCED+" ||
    upper === "ENHANCEDPLUS" ||
    upper === "ENHANCE_PLUS" ||
    upper === "ENHANCE+"
  ) {
    return "ENHANCED_PLUS";
  }
  return "PRIVATE";
}

export function getDeviceLimit(type: NormalizedAccountType): number {
  if (type === "PRIVATE") return 1;
  if (type === "PRIVATE_PLUS") return 10;
  if (type === "EXCLUSIVE" || type === "ENHANCED") return 1;
  return Number.POSITIVE_INFINITY; // ENHANCED_PLUS
}

/** Members allowed per account. `Infinity` means unbounded. */
export function getMemberLimit(type: NormalizedAccountType): number {
  // Private supports many users sharing the same zone type.
  // Exclusive is solo (admin + 1 invited user).
  if (type === "EXCLUSIVE") return 2;
  if (type === "ENHANCED") return 1;
  return Number.POSITIVE_INFINITY;
}

/** Whether administrators of this tier may generate member-invite QR codes. */
export function accountSupportsMemberInvite(type: NormalizedAccountType): boolean {
  return getMemberLimit(type) > 1;
}

export function canAdministratorInviteUserMember(params: {
  role?: string | null;
  accountType?: string | null;
  legacyAccountType?: string | null;
}): boolean {
  if (String(params.role ?? "").toLowerCase() !== "administrator") return false;
  return accountSupportsMemberInvite(
    normalizeAccountType(params.accountType, params.legacyAccountType),
  );
}

/** System administrator (Private tier) may edit the network ID in Settings. */
export function isSystemAdministrator(params: {
  accountType?: string | null;
  legacyAccountType?: string | null;
  role?: string | null;
}): boolean {
  if (String(params.role ?? "").toLowerCase() !== "administrator") return false;
  return normalizeAccountType(params.accountType, params.legacyAccountType) === "PRIVATE";
}

/** System administrator (Private tier) may edit the network ID in Settings. */
export function canEditNetworkId(params: {
  accountType?: string | null;
  legacyAccountType?: string | null;
}): boolean {
  return isSystemAdministrator({ ...params, role: "administrator" });
}

export const MEMBER_INVITE_UNAVAILABLE_HINT =
  "Member invite QR is available to administrators on Private, Private+, Exclusive, and Enhanced+ accounts. Enhanced accounts are solo and cannot invite members.";

export function accountTypeLabel(type: NormalizedAccountType): string {
  switch (type) {
    case "PRIVATE_PLUS":
      return "Private+";
    case "ENHANCED_PLUS":
      return "Enhanced+";
    case "EXCLUSIVE":
      return "Exclusive";
    case "ENHANCED":
      return "Enhanced";
    default:
      return "Private";
  }
}

export const ADMIN_ASSIGNABLE_ACCOUNT_TYPES: {
  value: NormalizedAccountType;
  apiValue: string;
  label: string;
}[] = [
  { value: "PRIVATE", apiValue: "private", label: "Private (System Admin)" },
  { value: "PRIVATE_PLUS", apiValue: "private_plus", label: "Private+" },
  { value: "EXCLUSIVE", apiValue: "exclusive", label: "Exclusive" },
  { value: "ENHANCED", apiValue: "enhanced", label: "Enhanced" },
  { value: "ENHANCED_PLUS", apiValue: "enhanced_plus", label: "Enhanced+" },
];

export function deviceLimitDescription(type: NormalizedAccountType): string {
  switch (type) {
    case "PRIVATE":
      return "Private accounts allow 1 registered device per user. You can switch devices from the login screen or Devices settings.";
    case "PRIVATE_PLUS":
      return "Private+ accounts allow up to 10 registered devices per user. Only one device can be active at a time.";
    case "EXCLUSIVE":
      return "Exclusive accounts allow 1 active device per user at a time. Use \"Use this device instead\" on login to switch phones.";
    case "ENHANCED":
      return "Enhanced accounts allow 1 active device per user at a time. Use \"Use this device instead\" on login to switch phones.";
    case "ENHANCED_PLUS":
      return "Enhanced+ accounts have no device cap, but only one session can be active at a time.";
  }
}

export function formatLimit(used: number, limit: number): string {
  if (!Number.isFinite(limit)) return `${used} / ∞`;
  return `${used} / ${limit}`;
}
