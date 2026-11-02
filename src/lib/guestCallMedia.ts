/**
 * Guest↔admin voice through LiveKit.
 * The phone joins a room with a token the API mints for this call.
 * Microphone only. Remote audio plays through the LiveKit audio session.
 */

import { Platform } from "react-native";
import { publishPartnerLevel } from "@/lib/callAudioBridge";
import { requestMicPermission } from "@/lib/micPermission";

type SignalPayload =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: RTCIceCandidateInit }
  | { kind: "audio"; b64: string; level?: number };

type LiveKitRoom = {
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  startAudio: () => Promise<void>;
  localParticipant: { setMicrophoneEnabled: (enabled: boolean) => Promise<void> };
  remoteParticipants: Map<string, { audioLevel?: number }>;
  on: (event: string, cb: (track: { kind: string; attach: () => HTMLMediaElement }) => void) => void;
};

let room: LiveKitRoom | null = null;
let levelTimer: ReturnType<typeof setInterval> | null = null;
let session = 0;
const remoteElements: HTMLMediaElement[] = [];

function stopLevels() {
  if (levelTimer) clearInterval(levelTimer);
  levelTimer = null;
  publishPartnerLevel(0);
}

export function guestCallMediaAvailable(): boolean {
  return true;
}

export async function startGuestCallMedia(_opts: {
  isOfferer: boolean;
  onSignal: (signal: SignalPayload) => void;
}): Promise<boolean> {
  return true;
}

export async function handleGuestCallSignal(
  _signal: SignalPayload,
  _onSignal?: (signal: SignalPayload) => void,
): Promise<void> {
  /* Voice is the LiveKit room, not socket audio frames. */
}

export async function connectLiveKitCall(serverUrl: string, token: string): Promise<boolean> {
  await stopGuestCallMedia();
  const mine = session;
  if (Platform.OS !== "web") {
    const mic = await requestMicPermission();
    if (mic !== "granted" || mine !== session) return false;
    const { AudioSession } = await import("@livekit/react-native");
    await AudioSession.startAudioSession();
  }
  if (mine !== session) return false;

  const { Room, RoomEvent, Track } = await import("livekit-client");
  const next = new Room({
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  }) as unknown as LiveKitRoom;

  if (Platform.OS === "web") {
    next.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind !== Track.Kind.Audio) return;
      const element = track.attach();
      element.autoplay = true;
      document.body.appendChild(element);
      remoteElements.push(element);
    });
  }

  try {
    await next.connect(serverUrl, token);
    if (mine !== session) {
      await next.disconnect();
      return false;
    }
    await next.localParticipant.setMicrophoneEnabled(true);
    if (Platform.OS === "web") await next.startAudio();
  } catch {
    try {
      await next.disconnect();
    } catch {
      /* already closed */
    }
    return false;
  }

  room = next;
  levelTimer = setInterval(() => {
    if (room !== next) return;
    let level = 0;
    next.remoteParticipants.forEach((participant) => {
      level = Math.max(level, Number(participant.audioLevel) || 0);
    });
    publishPartnerLevel(level);
  }, 80);
  return true;
}

export async function stopGuestCallMedia(): Promise<void> {
  session += 1;
  stopLevels();
  for (const element of remoteElements.splice(0)) {
    try {
      element.pause();
      element.remove();
    } catch {
      /* ignore */
    }
  }
  const current = room;
  room = null;
  if (current) {
    try {
      await current.disconnect();
    } catch {
      /* ignore */
    }
  }
  if (Platform.OS !== "web") {
    try {
      const { AudioSession } = await import("@livekit/react-native");
      await AudioSession.stopAudioSession();
    } catch {
      /* a route change must not take down hangup */
    }
  }
}
