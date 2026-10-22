/**
 * Guest↔admin voice.
 * Web uses WebRTC. Android and iOS play through the in-app audio page,
 * because this dev build has no native WebRTC module. Audio frames ride
 * the existing call socket to the other phone.
 */

import { Platform } from "react-native";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import {
  isCallMicLive,
  postCallAudio,
  primeCallAudio,
  setVoiceFrameHandler,
  startAndWaitForCallMic,
} from "@/lib/callAudioBridge";
import { requestMicPermission } from "@/lib/micPermission";

type SignalPayload =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: RTCIceCandidateInit }
  | { kind: "audio"; b64: string; level?: number };

type PeerBundle = {
  pc: RTCPeerConnection;
  localStream: MediaStream | null;
};

let active: PeerBundle | null = null;

function getRtcPeerConnection(): typeof RTCPeerConnection | null {
  if (Platform.OS !== "web") return null;
  const g = globalThis as typeof globalThis & {
    RTCPeerConnection?: typeof RTCPeerConnection;
  };
  if (typeof g.RTCPeerConnection === "function") return g.RTCPeerConnection;
  return null;
}

const callAudioConstraints: MediaTrackConstraints = {
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
  channelCount: { ideal: 1 },
};

async function getUserMedia(): Promise<MediaStream | null> {
  const nav = globalThis.navigator as
    | (Navigator & {
        mediaDevices?: { getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream> };
      })
    | undefined;
  if (!nav?.mediaDevices?.getUserMedia) return null;
  try {
    return await nav.mediaDevices.getUserMedia({ audio: callAudioConstraints, video: false });
  } catch {
    try {
      return await nav.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      return null;
    }
  }
}

/** Play and record together, on the speaker, without mixing in other apps. */
async function setCallAudioRoute(active: boolean): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Audio.setAudioModeAsync(
      active
        ? {
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            interruptionModeIOS: InterruptionModeIOS.DoNotMix,
            interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
            shouldDuckAndroid: false,
            playThroughEarpieceAndroid: false,
          }
        : {
            allowsRecordingIOS: false,
            playsInSilentModeIOS: false,
            staysActiveInBackground: false,
            interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
            interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          },
    );
  } catch {
    /* a route change must not take down the call */
  }
}

export function guestCallMediaAvailable(): boolean {
  return Platform.OS !== "web" || getRtcPeerConnection() != null;
}

export async function startGuestCallMedia(opts: {
  isOfferer: boolean;
  onSignal: (signal: SignalPayload) => void;
}): Promise<boolean> {
  if (Platform.OS !== "web") {
    await setCallAudioRoute(true);
    setVoiceFrameHandler((b64, level) => {
      opts.onSignal({ kind: "audio", b64, level });
    });
    if (!isCallMicLive()) {
      const mic = await requestMicPermission();
      if (mic !== "granted") {
        setVoiceFrameHandler(null);
        await setCallAudioRoute(false);
        return false;
      }
      primeCallAudio();
      void startAndWaitForCallMic(10000);
    }
    postCallAudio({ type: "voice-start" });
    return true;
  }
  await stopGuestCallMedia();

  const RTC = getRtcPeerConnection();
  if (!RTC) return false;

  const pc = new RTC({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  const localStream = await getUserMedia();
  if (localStream) {
    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream);
    }
  }

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      opts.onSignal({ kind: "ice", candidate: ev.candidate.toJSON() });
    }
  };

  active = { pc, localStream };

  if (opts.isOfferer) {
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    if (offer.sdp) {
      opts.onSignal({ kind: "offer", sdp: offer.sdp });
    }
  }
  return true;
}

export async function handleGuestCallSignal(
  signal: SignalPayload,
  onSignal?: (signal: SignalPayload) => void,
): Promise<void> {
  if (signal.kind === "audio") {
    if (signal.b64) postCallAudio({ type: "voice-play", b64: signal.b64 });
    return;
  }
  const bundle = active;
  if (!bundle) return;
  const { pc } = bundle;
  if (signal.kind === "offer") {
    await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (answer.sdp && onSignal) {
      onSignal({ kind: "answer", sdp: answer.sdp });
    }
  } else if (signal.kind === "answer") {
    await pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
  } else if (signal.kind === "ice" && signal.candidate) {
    try {
      await pc.addIceCandidate(signal.candidate);
    } catch {
      /* race with remote description */
    }
  }
}

export async function stopGuestCallMedia(): Promise<void> {
  setVoiceFrameHandler(null);
  postCallAudio({ type: "voice-stop" });
  await setCallAudioRoute(false);
  const bundle = active;
  active = null;
  if (!bundle) return;
  try {
    bundle.localStream?.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
  try {
    bundle.pc.close();
  } catch {
    /* ignore */
  }
}
