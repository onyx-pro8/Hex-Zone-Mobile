import { useCallback } from "react";
import { useRouter } from "expo-router";
import { useIsAdmin } from "@/hooks/useIsAdmin";

/**
 * Role-aware back target for guest-management stack screens.
 * Users land on the Guest tab; administrators land on the Access tab
 * (not Settings), matching how the web app anchors guest workflows on
 * Dashboard / Access rather than account settings.
 */
export function useGuestManagementBack() {
  const router = useRouter();
  const isAdmin = useIsAdmin();

  return useCallback(() => {
    if (isAdmin) {
      router.replace("/(tabs)/access-admin");
      return;
    }
    router.replace("/(tabs)/guest");
  }, [isAdmin, router]);
}
