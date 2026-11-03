import { useCallback } from "react";
import { useRouter } from "expo-router";

/**
 * Back target for guest list and passes when opened as their own screen.
 * Returns to Access → Guest access.
 */
export function useGuestManagementBack(pane: "list" | "passes" = "list") {
  const router = useRouter();

  return useCallback(() => {
    router.replace({
      pathname: "/(tabs)/access-admin",
      params: { tab: "guest", pane },
    });
  }, [pane, router]);
}
