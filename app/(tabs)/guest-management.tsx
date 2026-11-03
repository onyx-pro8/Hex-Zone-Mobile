import { Redirect } from "expo-router";

/** Guest list and passes now live under Access → Guest access. */
export default function GuestManagementScreen() {
  return <Redirect href="/(tabs)/access-admin?tab=guest" />;
}
