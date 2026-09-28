import { MessageSquareText, Ticket, UserCheck } from "lucide-react-native";
import { useRouter, type Href } from "expo-router";
import { SettingsNavRow } from "@/components/settings/SettingsNavRow";
import { colors } from "@/theme/colors";

/**
 * Shared Guest hub rows. Admins also see guest list + arrival message templates.
 */
export function GuestHubLinks({ includeAdminTools }: { includeAdminTools: boolean }) {
  const router = useRouter();

  return (
    <>
      {includeAdminTools ? (
        <SettingsNavRow
          icon={<UserCheck size={18} color={colors.accent} />}
          title="Guest list"
          subtitle="Pending and recent guest arrivals"
          onPress={() => router.push("/(tabs)/guest-list" as Href)}
        />
      ) : null}
      <SettingsNavRow
        icon={<Ticket size={18} color={colors.accent} />}
        title="Guest passes"
        subtitle="Event ID — guest enters it on arrival"
        onPress={() => router.push("/(tabs)/guest-passes" as Href)}
      />
      {includeAdminTools ? (
        <SettingsNavRow
          icon={<MessageSquareText size={18} color={colors.accent} />}
          title="Arrival messages"
          subtitle="Templates guests see when expected or waiting"
          onPress={() => router.push("/(tabs)/guest-arrival-messages" as Href)}
        />
      ) : null}
    </>
  );
}
