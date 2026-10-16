import { useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import WebView from "react-native-webview";

type VoiceHandler = (b64: string, level: number) => void;
type MicWaiter = {
  resolve: (ok: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
};

let webRef: WebView | null = null;
let pageReady = false;
const pending: string[] = [];
let onVoiceFrame: VoiceHandler | null = null;
const levelListeners = new Set<(level: number) => void>();
let onMicError: (() => void) | null = null;
let micCaptureLive = false;
const micWaiters = new Set<MicWaiter>();

function settleMicWaiters(ok: boolean) {
  micCaptureLive = ok;
  for (const waiter of micWaiters) {
    clearTimeout(waiter.timer);
    waiter.resolve(ok);
  }
  micWaiters.clear();
}

export function subscribePartnerLevel(listener: (level: number) => void) {
  levelListeners.add(listener);
  return () => {
    levelListeners.delete(listener);
  };
}

export function publishPartnerLevel(level: number) {
  const next = Math.max(0, Math.min(1, level));
  for (const listener of levelListeners) listener(next);
}

export function setMicErrorHandler(handler: (() => void) | null) {
  onMicError = handler;
}

const PAGE = `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;background:transparent;">
<script>
(function () {
  var ctx = null;
  var ringTimer = null;
  var micStream = null;
  var processor = null;
  var playAt = 0;
  var voiceGain = null;
  var lastLevelAt = 0;
  var frameSeq = 0;
  var primed = false;

  function audio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, ms) {
    var c = audio();
    if (!c) return;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.95, c.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + ms / 1000);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + ms / 1000 + 0.05);
  }

  function startRing() {
    stopRing();
    var pulse = function () {
      tone(440, 180);
      setTimeout(function () { tone(523, 180); }, 200);
    };
    pulse();
    ringTimer = setInterval(pulse, 1500);
  }

  function stopRing() {
    if (ringTimer) clearInterval(ringTimer);
    ringTimer = null;
  }

  var micElement = null;
  var lastUplink = 0;

  function stopMic() {
    if (processor) {
      try { processor.disconnect(); } catch (e) {}
      processor.onaudioprocess = null;
      processor = null;
    }
    if (micElement) {
      try { micElement.pause(); } catch (e) {}
      micElement.srcObject = null;
    }
    if (micStream) {
      micStream.getTracks().forEach(function (track) { track.stop(); });
      micStream = null;
    }
    primed = false;
  }

  function send(payload) {
    var json = JSON.stringify(payload);
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(json);
      }
    } catch (e) {}
    var kind = payload && payload.type ? String(payload.type) : "";
    if (kind !== "meter" && kind !== "ready" && kind !== "mic-ready" && kind !== "mic-primed" && kind !== "mic-error") {
      if (kind === "audio") kind = "meter";
      else return;
    }
    var now = Date.now();
    if (kind === "meter" && now - lastUplink < 100) return;
    lastUplink = now;
    var level = payload && payload.level ? payload.level : 0;
    var frame = document.getElementById("mic-uplink");
    if (!frame) {
      frame = document.createElement("iframe");
      frame.id = "mic-uplink";
      frame.style.cssText = "position:absolute;width:1px;height:1px;border:0;opacity:0;";
      document.body.appendChild(frame);
    }
    frame.src = "https://call-audio.local/" + kind + "?l=" + encodeURIComponent(String(level)) + "&t=" + Date.now();
  }

  function encodePcm(input, inRate) {
    var outRate = 8000;
    var step = Math.max(1, Math.round(inRate / outRate));
    var count = Math.floor(input.length / step);
    var pcm = new Int16Array(count);
    var energy = 0;
    var peak = 0;
    for (var i = 0; i < count; i++) {
      var sample = 0;
      for (var s = 0; s < step; s++) sample += input[i * step + s] || 0;
      sample = (sample / step) * 12;
      if (sample > 1) sample = 1;
      if (sample < -1) sample = -1;
      var abs = sample < 0 ? -sample : sample;
      if (abs > peak) peak = abs;
      energy += sample * sample;
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    var rms = count ? Math.sqrt(energy / count) : 0;
    var level = Math.max(0, Math.min(1, Math.max(peak * 8, rms * 28)));
    var bytes = new Uint8Array(pcm.buffer);
    return { b64: bytesToB64(bytes), level: level };
  }

  function bytesToB64(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function attachProcessor(stream, c) {
    micStream = stream;
    if (!micElement) {
      micElement = document.createElement("audio");
      micElement.setAttribute("autoplay", "true");
      micElement.setAttribute("playsinline", "true");
      micElement.volume = 0.01;
      document.body.appendChild(micElement);
    }
    micElement.srcObject = stream;
    var played = micElement.play();
    if (played && played.catch) played.catch(function () {});

    var source = c.createMediaStreamSource(stream);
    processor = c.createScriptProcessor(4096, 1, 1);
    var mute = c.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(c.destination);
    processor.onaudioprocess = function (event) {
      if (c.state === "suspended") c.resume();
      var input = event.inputBuffer.getChannelData(0);
      var rawPeak = 0;
      for (var n = 0; n < input.length; n++) {
        var abs = input[n] < 0 ? -input[n] : input[n];
        if (abs > rawPeak) rawPeak = abs;
      }
      var packed = encodePcm(input, event.inputBuffer.sampleRate || c.sampleRate || 48000);
      var level = Math.max(packed.level, Math.min(1, rawPeak * 14));
      frameSeq += 1;
      send({ type: "audio", b64: packed.b64, level: level, seq: frameSeq });
    };
    send({ type: "mic-ready" });
  }

  function openMic(c) {
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(function (stream) {
      primed = true;
      attachProcessor(stream, c);
      send({ type: "mic-primed" });
    });
  }

  function startMic() {
    var c = audio();
    if (!c || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      send({ type: "mic-error", message: "microphone unavailable" });
      return;
    }
    c.resume().catch(function () {});
    var live = micStream && micStream.getAudioTracks().some(function (track) {
      return track.readyState === "live";
    });
    if (live && processor) {
      send({ type: "mic-ready" });
      return;
    }
    stopMic();
    openMic(c).catch(function (err) {
      send({ type: "mic-error", message: String(err && err.message || err || "") });
    });
  }

  function primeMic() {
    var c = audio();
    if (!c || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    c.resume().catch(function () {});
    var live = micStream && micStream.getAudioTracks().some(function (track) {
      return track.readyState === "live";
    });
    if (live) {
      primed = true;
      send({ type: "mic-primed" });
      return;
    }
    openMic(c).catch(function () {});
  }

  function output() {
    var c = audio();
    if (!c) return null;
    if (!voiceGain) {
      voiceGain = c.createGain();
      voiceGain.gain.value = 2.2;
      voiceGain.connect(c.destination);
    }
    return voiceGain;
  }

  function playPcm(b64) {
    var c = audio();
    var dest = output();
    if (!c || !dest || !b64) return;
    if (c.state === "suspended") c.resume();
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var pcm = new Int16Array(bytes.buffer);
    if (!pcm.length) return;
    var buffer = c.createBuffer(1, pcm.length, 8000);
    var channel = buffer.getChannelData(0);
    var energy = 0;
    for (var k = 0; k < pcm.length; k++) {
      var sample = pcm[k] / 32768;
      channel[k] = sample;
      energy += sample * sample;
    }
    var rms = Math.sqrt(energy / pcm.length);
    var level = Math.max(0, Math.min(1, rms * 8));
    var nowMs = Date.now();
    if (nowMs - lastLevelAt > 35) {
      lastLevelAt = nowMs;
      send({ type: "level", level: level });
    }
    var node = c.createBufferSource();
    node.buffer = buffer;
    node.connect(dest);
    var now = c.currentTime;
    if (!playAt || playAt < now + 0.01) playAt = now + 0.03;
    node.start(playAt);
    playAt += buffer.duration;
  }

  window.__callAudio = function (raw) {
    var msg = {};
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (msg.type === "ring") startRing();
    else if (msg.type === "stop") stopRing();
    else if (msg.type === "connected") { stopRing(); tone(523, 120); setTimeout(function () { tone(659, 200); }, 130); }
    else if (msg.type === "ended") { stopRing(); stopMic(); tone(392, 140); setTimeout(function () { tone(262, 220); }, 150); }
    else if (msg.type === "prime") primeMic();
    else if (msg.type === "voice-start") startMic();
    else if (msg.type === "voice-stop") { stopMic(); playAt = 0; }
    else if (msg.type === "voice-play") playPcm(msg.b64);
  };

  function onHost(event) {
    if (event && event.data) window.__callAudio(String(event.data));
  }
  document.addEventListener("message", onHost);
  window.addEventListener("message", onHost);
  send({ type: "ready" });
})();
</script>
</body></html>`;

function flush(raw: string) {
  const view = webRef;
  if (!view) {
    pending.push(raw);
    return;
  }
  // postMessage from React Native into this WebView does not arrive on Android.
  // injectJavaScript is the channel the audio page actually receives.
  view.injectJavaScript(
    `window.__callAudio && window.__callAudio(${JSON.stringify(raw)}); true;`,
  );
}

export function postCallAudio(command: Record<string, unknown>) {
  if (Platform.OS === "web") return;
  if (command.type === "voice-stop" || command.type === "ended") {
    micCaptureLive = false;
  }
  const raw = JSON.stringify(command);
  if (!pageReady || !webRef) {
    pending.push(raw);
    return;
  }
  flush(raw);
}

/** Call from a button press so Android unlocks mic + AudioContext. */
export function primeCallAudio() {
  postCallAudio({ type: "prime" });
}

export function isCallMicLive(): boolean {
  return micCaptureLive;
}

/**
 * Open the WebView mic and wait until capture is live.
 * Call this only after the OS microphone permission is granted.
 */
export function startAndWaitForCallMic(timeoutMs = 8000): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(true);
  if (micCaptureLive) return Promise.resolve(true);
  return new Promise((resolve) => {
    const waiter: MicWaiter = {
      resolve,
      timer: setTimeout(() => {
        micWaiters.delete(waiter);
        resolve(false);
      }, timeoutMs),
    };
    micWaiters.add(waiter);
    primeCallAudio();
    postCallAudio({ type: "voice-start" });
  });
}

export function setVoiceFrameHandler(handler: VoiceHandler | null) {
  onVoiceFrame = handler;
}

export function CallAudioBridge() {
  const ref = useRef<WebView | null>(null);

  useEffect(() => {
    return () => {
      if (webRef === ref.current) webRef = null;
      pageReady = false;
    };
  }, []);

  if (Platform.OS === "web") return null;

  return (
    <View pointerEvents="none" collapsable={false} style={styles.host}>
      <WebView
        ref={(node) => {
          ref.current = node;
          webRef = node;
        }}
        source={{ html: PAGE, baseUrl: "https://safe-zone-patrol-server.onrender.com/" }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        allowsInlineMediaPlayback
        allowFileAccess
        allowUniversalAccessFromFileURLs
        androidLayerType="none"
        cacheEnabled={false}
        style={styles.webview}
        onShouldStartLoadWithRequest={(request) => {
          const url = request.url || "";
          if (!url.startsWith("https://call-audio.local/")) return true;
          const path = url.slice("https://call-audio.local/".length);
          const kind = path.split("?")[0];
          const levelMatch = /(?:^|&)l=([^&]+)/.exec(path.split("?")[1] || "");
          const level = levelMatch ? Number(decodeURIComponent(levelMatch[1])) : 0;
          if (kind === "ready") {
            pageReady = true;
            const queued = pending.splice(0, pending.length);
            for (const raw of queued) flush(raw);
          } else if (kind === "mic-ready" || kind === "mic-primed") {
            settleMicWaiters(true);
          } else if (kind === "mic-error") {
            settleMicWaiters(false);
            onMicError?.();
          } else if (kind === "meter" && Number.isFinite(level)) {
            micCaptureLive = true;
            publishPartnerLevel(Math.min(1, level));
          }
          return false;
        }}
        onLoadEnd={() => {
          pageReady = true;
          const queued = pending.splice(0, pending.length);
          for (const raw of queued) flush(raw);
        }}
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data) as {
              type?: string;
              b64?: string;
              level?: number;
              message?: string;
            };
            if (msg.type === "ready") {
              pageReady = true;
              const queued = pending.splice(0, pending.length);
              for (const raw of queued) flush(raw);
              return;
            }
            if (msg.type === "mic-ready" || msg.type === "mic-primed") {
              settleMicWaiters(true);
              return;
            }
            if (msg.type === "mic-error") {
              settleMicWaiters(false);
              onMicError?.();
              return;
            }
            if (msg.type === "meter" || msg.type === "audio") {
              const level = Math.min(1, Number(msg.level) || 0);
              if (level > 0) publishPartnerLevel(level);
            }
            if (msg.type === "audio" && msg.b64) {
              micCaptureLive = true;
              onVoiceFrame?.(msg.b64, Number(msg.level) || 0);
            }
          } catch {
            /* ignore malformed bridge messages */
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Android mutes capture in fully invisible WebViews — keep a tiny on-screen surface.
  host: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: 160,
    height: 160,
    opacity: 1,
    zIndex: 1,
    elevation: 1,
  },
  webview: {
    width: 160,
    height: 160,
    backgroundColor: "transparent",
  },
});
