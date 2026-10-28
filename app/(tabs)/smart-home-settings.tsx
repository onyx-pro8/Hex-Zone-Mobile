import { useEffect } from "react";
import { useRouter } from "expo-router";

/** Smart-home setup now lives on each device. Keep the route so old links land on Devices. */
export default function SmartHomeSettingsScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(tabs)/devices");
  }, [router]);

  return null;
}
