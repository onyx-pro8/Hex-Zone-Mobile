import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Standard 3-button Android navigation bar height (dp). */
const ANDROID_NAV_BAR_FALLBACK = 48;

/**
 * Bottom safe inset that accounts for Android edge-to-edge when
 * react-native-safe-area-context reports 0 for the navigation bar.
 */
export function useBottomSafeInset(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS !== "android") return insets.bottom;
  return Math.max(insets.bottom, ANDROID_NAV_BAR_FALLBACK);
}
