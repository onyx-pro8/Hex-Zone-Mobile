import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Maximize2, Phone, PhoneOff } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGuestCallOptional } from "@/context/GuestCallContext";
import { subscribePartnerLevel, postCallAudio } from "@/lib/callAudioBridge";
import { playConnected, playEnded, startRinging, stopRinging } from "@/lib/callSounds";
import { resolveAvatarDisplayUri, useResolvedAvatarUri } from "@/lib/resolveAvatarUri";

function otherPartyName(callerRole: "guest" | "admin", isCaller: boolean, guestName: string) {
  if (callerRole === "guest") {
    return isCaller ? "Administrator" : guestName;
  }
  return isCaller ? guestName : "Administrator";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "C";
}

const VOICE_DOTS = 11;

function PartnerVoiceLine({ active }: { active: boolean }) {
  const [level, setLevel] = useState(0);
  const levelRef = useRef(0);

  useEffect(() => {
    if (!active) {
      levelRef.current = 0;
      setLevel(0);
      return;
    }
    postCallAudio({ type: "voice-start" });
    const unsubscribe = subscribePartnerLevel((next) => {
      levelRef.current = Math.max(levelRef.current, next);
    });
    const timer = setInterval(() => {
      setLevel(levelRef.current);
      levelRef.current *= 0.72;
    }, 80);
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [active]);

  return (
    <View style={styles.voiceLine}>
      {Array.from({ length: VOICE_DOTS }, (_, index) => {
        const shape = 0.4 + 0.6 * Math.abs(Math.sin(index * 0.85));
        const height = 6 + Math.min(1, level) * 26 * shape;
        return (
          <View
            key={index}
            style={[styles.voiceDot, { height, borderRadius: height / 2 }]}
          />
        );
      })}
    </View>
  );
}

function visualKey(guestId: string, callId: string) {
  return guestId.trim() || callId;
}

export function CallOverlay() {
  const call = useGuestCallOptional();
  const insets = useSafeAreaInsets();
  const enter = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const ringA = useRef(new Animated.Value(0)).current;
  const ringB = useRef(new Animated.Value(0)).current;
  const ringC = useRef(new Animated.Value(0)).current;

  const session = call?.session ?? null;
  const otherAvatarUrl = session
    ? (session.callerRole === "guest" ? session.isCaller : !session.isCaller)
      ? session.adminAvatarUrl
      : session.guestAvatarUrl
    : null;
  const resolvedAvatar = useResolvedAvatarUri(otherAvatarUrl);
  const [avatarSettled, setAvatarSettled] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [photoReady, setPhotoReady] = useState(false);
  const [reveal, setReveal] = useState(false);
  const revealedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setAvatarFailed(false);
    if (!otherAvatarUrl) {
      setAvatarSettled(true);
      return;
    }
    if (resolvedAvatar) {
      setAvatarSettled(true);
      return;
    }
    setAvatarSettled(false);
    let cancelled = false;
    void resolveAvatarDisplayUri(otherAvatarUrl).then(() => {
      if (!cancelled) setAvatarSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, [otherAvatarUrl, resolvedAvatar]);

  const photo = avatarFailed ? null : resolvedAvatar;
  const callId = session?.callId ?? null;
  const guestId = session?.guestId ?? "";
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [callId]);

  useEffect(() => {
    if (!session || !callId) {
      revealedKeyRef.current = null;
      setReveal(false);
      setPhotoReady(false);
      enter.setValue(0);
      return;
    }
    const key = visualKey(guestId, callId);
    const alreadyOpen = revealedKeyRef.current === key;
    let cancelled = false;

    const openCard = (ready: boolean) => {
      if (cancelled) return;
      setPhotoReady(ready);
      revealedKeyRef.current = key;
      setReveal(true);
      if (alreadyOpen) {
        enter.setValue(1);
        return;
      }
      enter.setValue(0);
      Animated.timing(enter, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };

    // Both cards open from the server event. The photo fills in when it arrives.
    openCard(Boolean(resolvedAvatar));
    return () => {
      cancelled = true;
    };
  }, [
    session,
    callId,
    guestId,
    otherAvatarUrl,
    resolvedAvatar,
    avatarFailed,
    avatarSettled,
    enter,
  ]);

  useEffect(() => {
    if (!session || session.state !== "ringing") {
      pulse.setValue(1);
      ringA.setValue(0);
      ringB.setValue(0);
      ringC.setValue(0);
      return;
    }
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.03,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const halo = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 2400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
    const a = halo(ringA, 0);
    const b = halo(ringB, 800);
    const c = halo(ringC, 1600);
    breathe.start();
    a.start();
    b.start();
    c.start();
    return () => {
      breathe.stop();
      a.stop();
      b.stop();
      c.stop();
    };
  }, [session, pulse, ringA, ringB, ringC]);

  const heardRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session) {
      if (heardRef.current) playEnded();
      heardRef.current = null;
      stopRinging();
      return;
    }
    if (session.state === "ringing" || session.state === "queued") {
      if (heardRef.current !== "ringing") startRinging();
      heardRef.current = "ringing";
      return;
    }
    if (session.state === "connected" && heardRef.current !== "connected") {
      playConnected();
      heardRef.current = "connected";
    }
  }, [session, session?.state, session?.callId]);

  if (!call || !session || !reveal) return null;

  const fullscreen = Boolean(session.fullscreen) || expanded;
  const isQueued = session.state === "queued";
  const isIncoming = session.state === "ringing" && !session.isCaller;
  const isOutgoing = session.state === "ringing" && session.isCaller;
  const connected = session.state === "connected";
  const ringing = session.state === "ringing";
  const party = otherPartyName(session.callerRole, session.isCaller, session.guestName);
  const queueLabel =
    session.queuePosition && session.queuePosition > 1
      ? `Waiting in queue · ${session.queuePosition}`
      : "Waiting in queue…";
  const status = connected
    ? call.elapsedLabel
    : isQueued
      ? queueLabel
      : isOutgoing
        ? "Calling…"
        : "Incoming call";

  const haloStyle = (value: Animated.Value) => ({
    transform: [
      {
        scale: value.interpolate({
          inputRange: [0, 1],
          outputRange: [0.82, 1.55],
        }),
      },
    ],
    opacity: value.interpolate({
      inputRange: [0, 0.55, 1],
      outputRange: [0.4, 0.14, 0],
    }),
  });

  const avatarNode = (light: boolean) => (
    <View style={styles.ringHost}>
      {ringing ? (
        <>
          <Animated.View
            style={[styles.halo, light && styles.haloLight, isIncoming && styles.haloIncoming, haloStyle(ringA)]}
          />
          <Animated.View
            style={[styles.halo, light && styles.haloLight, isIncoming && styles.haloIncoming, haloStyle(ringB)]}
          />
          <Animated.View
            style={[styles.halo, light && styles.haloLight, isIncoming && styles.haloIncoming, haloStyle(ringC)]}
          />
        </>
      ) : (
        <View style={[styles.haloIdle, light && styles.haloIdleLight]} />
      )}
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <View style={[styles.avatar, light && styles.avatarLight]}>
          {photo ? (
            <Image
              source={{ uri: photo }}
              style={styles.avatarImage}
              onLoad={() => setPhotoReady(true)}
              onError={() => {
                setAvatarFailed(true);
                setPhotoReady(true);
              }}
            />
          ) : (
            <Text style={styles.avatarText}>{initials(party)}</Text>
          )}
        </View>
      </Animated.View>
    </View>
  );

  if (fullscreen) {
    return (
      <Animated.View
        style={[
          styles.fullScreen,
          {
            paddingTop: insets.top + 32,
            paddingBottom: insets.bottom + 40,
            opacity: enter,
            transform: [
              {
                translateY: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
              {
                scale: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.985, 1],
                }),
              },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={
            isIncoming
              ? ["#F7FBF8", "#EAF6EF", "#F5F8FC"]
              : ["#F8FBFF", "#EEF4FC", "#F5F8FC"]
          }
          locations={[0, 0.48, 1]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <Text style={styles.kickerLight}>
          {isOutgoing ? "Outgoing" : isIncoming ? "Incoming" : "Access call"}
        </Text>
        {expanded && !session.fullscreen ? (
          <Pressable onPress={() => setExpanded(false)} style={styles.minimizeBtn}>
            <Text style={styles.minimizeText}>Minimize</Text>
          </Pressable>
        ) : null}
        <View style={styles.hero}>
          {avatarNode(true)}
          <Text style={styles.partyLight}>{party}</Text>
          <Text style={[styles.statusLight, isIncoming && styles.statusIncoming]}>
            {status}
          </Text>
          {connected ? <PartnerVoiceLine active /> : null}
          <Text style={styles.hintLight}>
            {connected
              ? "Voice connected"
              : isQueued
                ? "Another call is in progress. Yours starts when it ends."
                : isIncoming
                  ? "Answer to speak with them"
                  : "Waiting for an answer"}
          </Text>
        </View>
        <View style={styles.dock}>
          {isIncoming ? (
            <>
              <Pressable onPress={call.rejectCall} style={styles.roundWrap}>
                <View style={[styles.round, styles.roundReject]}>
                  <PhoneOff size={26} color="#fff" />
                </View>
                <Text style={styles.roundLabelLight}>Decline</Text>
              </Pressable>
              <Pressable onPress={call.acceptCall} style={styles.roundWrap}>
                <View style={[styles.round, styles.roundAccept]}>
                  <Phone size={26} color="#fff" />
                </View>
                <Text style={styles.roundLabelLight}>Accept</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={connected ? call.endCall : call.cancelCall}
              style={styles.roundWrap}
            >
              <View style={[styles.round, styles.roundReject]}>
                <PhoneOff size={26} color="#fff" />
              </View>
              <Text style={styles.roundLabelLight}>
                {connected ? "End" : "Cancel"}
              </Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    );
  }

  const title = connected
    ? `On call · ${call.elapsedLabel}`
    : isQueued
      ? queueLabel
      : isOutgoing
        ? `Calling ${party}…`
        : `${party} is calling`;

  return (
    <View pointerEvents="box-none" style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <Animated.View
        style={[
          styles.card,
          isIncoming ? styles.cardIncoming : isOutgoing ? styles.cardOutgoing : null,
          {
            opacity: enter,
            transform: [
              {
                translateY: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-16, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.row}>
          <View style={styles.iconWrap}>
            {photo ? (
              <Image
                source={{ uri: photo }}
                style={styles.iconImage}
                onLoad={() => setPhotoReady(true)}
                onError={() => {
                  setAvatarFailed(true);
                  setPhotoReady(true);
                }}
              />
            ) : (
              <Text style={styles.iconText}>{initials(party)}</Text>
            )}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.sub}>
              {connected
                ? "Voice connected"
                : isQueued
                  ? "Yours starts when the current call ends"
                  : isIncoming
                    ? "Answer or decline"
                    : "Request sent · waiting for an answer"}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          {isIncoming ? (
            <>
              <Pressable onPress={call.acceptCall} style={[styles.btn, styles.accept]}>
                <Phone size={16} color="#fff" />
                <Text style={styles.btnText}>Accept</Text>
              </Pressable>
              <Pressable onPress={call.rejectCall} style={[styles.btn, styles.reject]}>
                <PhoneOff size={16} color="#fff" />
                <Text style={styles.btnText}>Reject</Text>
              </Pressable>
            </>
          ) : null}
          {isOutgoing || isQueued ? (
            <Pressable onPress={call.cancelCall} style={[styles.btn, styles.reject]}>
              <PhoneOff size={16} color="#fff" />
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
          ) : null}
          {connected ? (
            <>
              <Pressable onPress={() => setExpanded(true)} style={[styles.btn, styles.expand]}>
                <Maximize2 size={16} color="#fff" />
                <Text style={styles.btnText}>Full</Text>
              </Pressable>
              <Pressable onPress={call.endCall} style={[styles.btn, styles.reject]}>
                <PhoneOff size={16} color="#fff" />
                <Text style={styles.btnText}>End</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: "#F5F8FC",
    paddingHorizontal: 28,
  },
  kickerLight: {
    color: "#8694AC",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 2.4,
    textTransform: "uppercase",
    textAlign: "center",
  },
  minimizeBtn: {
    position: "absolute",
    top: 36,
    right: 20,
    zIndex: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  minimizeText: {
    color: "#5C6B82",
    fontSize: 13,
    fontWeight: "600",
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ringHost: {
    width: 176,
    height: 176,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  halo: {
    position: "absolute",
    width: 176,
    height: 176,
    borderRadius: 88,
    borderWidth: 1.5,
    borderColor: "rgba(154, 196, 255, 0.4)",
  },
  haloLight: {
    borderColor: "rgba(47, 128, 237, 0.28)",
  },
  haloIncoming: {
    borderColor: "rgba(46, 155, 87, 0.4)",
  },
  haloIdle: {
    position: "absolute",
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: "rgba(90, 162, 247, 0.1)",
  },
  haloIdleLight: {
    backgroundColor: "rgba(47, 128, 237, 0.08)",
  },
  avatar: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: "#16345F",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.2)",
  },
  avatarLight: {
    borderColor: "rgba(15, 44, 92, 0.1)",
    shadowColor: "#0F2C5C",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  avatarImage: {
    width: 116,
    height: 116,
  },
  avatarText: {
    color: "#fff",
    fontSize: 36,
    fontWeight: "600",
    letterSpacing: 1,
  },
  partyLight: {
    color: "#0F2C5C",
    fontSize: 30,
    fontWeight: "600",
    letterSpacing: -0.6,
    textAlign: "center",
  },
  statusLight: {
    color: "#2F80ED",
    fontSize: 16,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  statusIncoming: {
    color: "#1F8A4C",
  },
  voiceLine: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
  },
  voiceDot: {
    width: 7,
    backgroundColor: "#2F80ED",
  },
  hintLight: {
    color: "#8694AC",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 4,
    maxWidth: 280,
  },
  dock: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 52,
    paddingBottom: 8,
  },
  roundWrap: {
    alignItems: "center",
    gap: 10,
  },
  round: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
  },
  roundAccept: {
    backgroundColor: "#2E9B57",
  },
  roundReject: {
    backgroundColor: "#D64545",
  },
  roundLabelLight: {
    color: "#566784",
    fontSize: 12,
    fontWeight: "500",
  },
  root: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 1000,
    elevation: 1000,
    paddingHorizontal: 12,
  },
  card: {
    borderRadius: 18,
    backgroundColor: "rgba(11, 28, 54, 0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
    gap: 12,
    shadowColor: "#050A14",
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  cardOutgoing: {
    borderLeftWidth: 3,
    borderLeftColor: "#2F80ED",
  },
  cardIncoming: {
    borderLeftWidth: 3,
    borderLeftColor: "#2E9B57",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#16345F",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.18)",
  },
  iconImage: {
    width: 48,
    height: 48,
  },
  iconText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  sub: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  accept: {
    backgroundColor: "#2E9B57",
  },
  expand: {
    backgroundColor: "#2457C5",
  },
  reject: {
    backgroundColor: "#D64545",
  },
  btnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
});
