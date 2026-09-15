import { useCallback } from "react";
import { useRouter } from "expo-router";
import { useIsAdmin } from "@/hooks/useIsAdmin";

/**
 * Role-aware back target for guest-management stack screens.
 * Administrators return to the Guest management hub (reachable from
 * Account settings). Non-admins return to the Guest tab.
 */
export function useGuestManagementBack() {
  const router = useRouter();
  const isAdmin = useIsAdmin();

  return useCallback(() => {
    if (isAdmin) {
      router.replace("/(tabs)/guest-management");
      return;
    }
    router.replace("/(tabs)/guest");
  }, [isAdmin, router]);
}
