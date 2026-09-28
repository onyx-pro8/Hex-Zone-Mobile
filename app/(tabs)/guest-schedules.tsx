import { Redirect } from "expo-router";

/** Guest access is Event ID pass only — calendar schedules are not used. */
export default function GuestSchedulesRedirect() {
  return <Redirect href="/(tabs)/guest-passes" />;
}
