import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";

/** Matches `app/(tabs)/settings.tsx` and tab layout admin detection. */
export function useIsAdmin(): boolean {
  const { user } = useAuth();
  return useMemo(() => {
    const role = String(user?.role ?? "").toLowerCase();
    if (role) return role !== "user";
    const regType = String(
      user?.registrationType ?? user?.registration_type ?? "",
    ).toUpperCase();
    return regType !== "USER";
  }, [user?.role, user?.registrationType, user?.registration_type]);
}
