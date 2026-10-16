import { Platform, Vibration } from "react-native";
import { postCallAudio } from "@/lib/callAudioBridge";

type Osc = OscillatorType;

let ringTimer: ReturnType<typeof setInterval> | null = null;
let audioCtx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (Platform.OS !== "web") return null;
  const host = globalThis as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = host.AudioContext || host.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

function beep(freq: number, ms: number, type: Osc = "sine") {
  const ctx = audioContext();
  if (!ctx) return false;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + ms / 1000);
  return true;
}

export function startRinging() {
  stopRinging();
  if (Platform.OS === "web") {
    beep(440, 180);
    ringTimer = setInterval(() => {
      beep(440, 150);
      setTimeout(() => beep(494, 150), 180);
    }, 1500);
    return;
  }
  Vibration.vibrate([0, 420, 200, 420], true);
  postCallAudio({ type: "ring" });
}

export function stopRinging() {
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
  if (Platform.OS !== "web") {
    Vibration.cancel();
    postCallAudio({ type: "stop" });
  }
}

export function playConnected() {
  stopRinging();
  if (Platform.OS === "web") {
    beep(523, 110);
    setTimeout(() => beep(659, 180), 120);
    return;
  }
  postCallAudio({ type: "connected" });
}

export function playEnded() {
  if (Platform.OS === "web") {
    stopRinging();
    beep(392, 120, "triangle");
    setTimeout(() => beep(262, 200, "triangle"), 140);
    return;
  }
  postCallAudio({ type: "ended" });
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
  Vibration.cancel();
}
