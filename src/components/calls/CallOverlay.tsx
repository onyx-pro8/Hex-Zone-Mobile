import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Phone, PhoneOff, PhoneIncoming } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGuestCallOptional } from "@/context/GuestCallContext";
import { colors } from "@/theme/colors";

export function CallOverlay() {
  const call = useGuestCallOptional();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(-120)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  const session = call?.session ?? null;

  useEffect(() => {
    if (!session) {
      Animated.timing(slide, {
        toValue: -160,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.spring(slide, {
      toValue: 0,
      friction: 8,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [session, slide]);

  useEffect(() => {
    if (!session || session.state !== "ringing") {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.12,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [session, pulse]);

  if (!call || !session) return null;

  const fullscreen = session.fullscreen;
  const isIncoming = session.state === "ringing" && !session.isCaller;
  const isOutgoing = session.state === "ringing" && session.isCaller;
  const connected = session.state === "connected";
  const title = connected
    ? `On call · ${call.elapsedLabel}`
    : isOutgoing
      ? `Calling ${session.guestName}…`
      : `${session.guestName} is calling`;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.root,
        fullscreen ? styles.rootFull : styles.rootTop,
        { paddingTop: insets.top + (fullscreen ? 24 : 8) },
      ]}
    >
      <Animated.View
        style={[
          styles.card,
          fullscreen && styles.cardFull,
          { transform: [{ translateY: slide }] },
        ]}
      >
        <View style={styles.row}>
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <View style={styles.iconWrap}>
              {isIncoming ? (
                <PhoneIncoming size={22} color="#fff" />
              ) : (
                <Phone size={22} color="#fff" />
              )}
            </View>
          </Animated.View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.sub}>
              {connected
                ? "Voice connected"
                : fullscreen
                  ? "Escalated access request — please answer"
                  : "Guest access voice call"}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          {isIncoming ? (
            <>
              <Pressable
                onPress={call.acceptCall}
                style={[styles.btn, styles.accept]}
              >
                <Phone size={16} color="#fff" />
                <Text style={styles.btnText}>Accept</Text>
              </Pressable>
              <Pressable
                onPress={call.rejectCall}
                style={[styles.btn, styles.reject]}
              >
                <PhoneOff size={16} color="#fff" />
                <Text style={styles.btnText}>Reject</Text>
              </Pressable>
            </>
          ) : null}
          {isOutgoing ? (
            <Pressable
              onPress={call.cancelCall}
              style={[styles.btn, styles.reject]}
            >
              <PhoneOff size={16} color="#fff" />
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
          ) : null}
          {connected ? (
            <Pressable
              onPress={call.endCall}
              style={[styles.btn, styles.reject]}
            >
              <PhoneOff size={16} color="#fff" />
              <Text style={styles.btnText}>End</Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000,
    paddingHorizontal: 12,
  },
  rootTop: {
    top: 0,
  },
  rootFull: {
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(8, 18, 40, 0.92)",
    justifyContent: "center",
  },
  card: {
    borderRadius: 16,
    backgroundColor: "#0F2C5C",
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  cardFull: {
    marginHorizontal: 8,
    paddingVertical: 28,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  sub: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  accept: {
    backgroundColor: "#2FA24A",
  },
  reject: {
    backgroundColor: "#E23B4E",
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
});
