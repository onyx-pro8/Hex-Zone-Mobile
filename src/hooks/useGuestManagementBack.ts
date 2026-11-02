import { useCallback } from "react";
import { useRouter } from "expo-router";
import { useIsAdmin } from "@/hooks/useIsAdmin";

/**
 * Back target for guest list and passes when opened as their own screen.
 * Administrators return to that pane under Access → Guest access.
 * Everyone else returns to the Guest tab.
 */
export function useGuestManagementBack(pane: "list" | "passes" = "list") {
  const router = useRouter();
  const isAdmin = useIsAdmin();

  return useCallback(() => {
    if (isAdmin) {
      router.replace({
        pathname: "/(tabs)/access-admin",
        params: { tab: "guest", pane },
      });
      return;
    }
    router.replace("/(tabs)/guest");
  }, [isAdmin, pane, router]);
}
