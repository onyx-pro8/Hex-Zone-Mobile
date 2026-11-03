import { Platform } from "react-native";

if (Platform.OS !== "web") {
  try {
    // Native WebRTC globals. Must run before a LiveKit room connects.
    // A development build from before this package was added will not have
    // the native module yet; the rest of the app still has to open.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { registerGlobals } = require("@livekit/react-native") as {
      registerGlobals: () => void;
    };
    registerGlobals();
  } catch {
    /* rebuilt dev client required for voice */
  }
}
