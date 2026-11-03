import { Ticket } from "lucide-react-native";
import { useRouter, type Href } from "expo-router";
import { SettingsNavRow } from "@/components/settings/SettingsNavRow";
import { colors } from "@/theme/colors";

/** Guest tab shortcut. Administrators manage list and passes on Access. */
export function GuestHubLinks() {
  const router = useRouter();

  return (
    <SettingsNavRow
      icon={<Ticket size={18} color={colors.accent} />}
      title="Guest passes"
      subtitle="Event ID — guest enters it on arrival"
      onPress={() => router.push("/(tabs)/guest-passes" as Href)}
    />
  );
}
