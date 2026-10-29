import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { File as ExpoFile, Paths } from "expo-file-system";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import {
  approveUniversalAccessRequest,
  createInviteUniversalAccessRequest,
  createPlaceAccessUniversalRequest,
  deleteUniversalAccessRequest,
  getUniversalAccessRequest,
  listShareableUniversalZones,
  listUniversalAccessRequests,
  rejectUniversalAccessRequest,
  searchUniversalAccessInvitees,
  searchUniversalAccessTargets,
  setUniversalAccessEnabled,
  updateUniversalAccessDocs,
  type UniversalAccessInvitee,
  type UniversalAccessRequestRow,
  type UniversalAccessTargetNetwork,
  type UniversalAccessZone,
} from "@/api/universalAccess";
import {
  Check,
  Copy as CopyIcon,
  RefreshCw as RefreshIcon,
  Search,
} from "lucide-react-native";
import { copyToClipboard } from "@/lib/copyToClipboard";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

type Tab = "invite" | "place" | "list";

function parseDataUrl(value: string): { mime: string; base64: string } | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("data:")) return null;
  const comma = trimmed.indexOf(",");
  if (comma < 0) return null;
  const mime = (trimmed.slice(5, comma).split(";")[0] || "application/octet-stream").toLowerCase();
  return { mime, base64: trimmed.slice(comma + 1).replace(/\s/g, "") };
}

function fileKind(mime: string): "image" | "pdf" | "text" | "docx" | "doc" | "other" {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime === "text/plain") return "text";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return "docx";
  }
  if (mime === "application/msword") return "doc";
  return "other";
}

function fileExtension(kind: ReturnType<typeof fileKind>, mime: string): string {
  if (kind === "pdf") return "pdf";
  if (kind === "text") return "txt";
  if (kind === "docx") return "docx";
  if (kind === "doc") return "doc";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (kind === "image") return "jpg";
  return "bin";
}

function fileTypeLabel(kind: ReturnType<typeof fileKind>): string {
  if (kind === "image") return "Image";
  if (kind === "pdf") return "PDF";
  if (kind === "text") return "Text file";
  if (kind === "docx" || kind === "doc") return "Word document";
  return "File";
}

function decodeBase64Text(payload: string): string {
  const binary = globalThis.atob(payload);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function previewHtml(kind: "pdf" | "docx", base64: string): string {
  const payload = JSON.stringify(base64);
  if (kind === "pdf") {
    return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>body{margin:0;background:#f4f7fb;}canvas{width:100%;height:auto;display:block;margin:0 0 8px;background:#fff;}</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
</head><body><div id="pages"></div>
<script>
  const payload = ${payload};
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  pdfjsLib.getDocument({ data: bytes }).promise.then(async function (pdf) {
    const root = document.getElementById("pages");
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.3 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      root.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
    }
  }).catch(function () {
    document.body.textContent = "Could not preview this PDF. Use Download to open it.";
  });
</script></body></html>`;
  }
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>body{margin:0;padding:12px;font-family:sans-serif;color:#0F2C5C;}</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js"></script>
</head><body><div id="doc">Loading document…</div>
<script>
  const payload = ${payload};
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  mammoth.convertToHtml({ arrayBuffer: bytes.buffer })
    .then(function (result) { document.getElementById("doc").innerHTML = result.value || "Empty document."; })
    .catch(function () { document.getElementById("doc").textContent = "Could not preview this Word document. Use Download to open it."; });
</script></body></html>`;
}

async function downloadDataUrl(value: string, label: string): Promise<void> {
  const parsed = parseDataUrl(value);
  if (!parsed) {
    toast.error("This file cannot be downloaded.");
    return;
  }
  const kind = fileKind(parsed.mime);
  const filename = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}.${fileExtension(kind, parsed.mime)}`;
  const file = new ExpoFile(Paths.cache, filename);
  try {
    if (file.exists) file.delete();
    file.create();
    file.write(parsed.base64, { encoding: "base64" });
  } catch {
    toast.error("Could not save the file.");
    return;
  }
  try {
    if (Platform.OS === "android") {
      await Linking.openURL(file.contentUri);
      return;
    }
    const result = await Share.share({ url: file.uri, title: filename });
    if (result.action === Share.dismissedAction) return;
  } catch {
    toast.error("Could not open the file.");
  }
}

function ReviewDocument({ label, uri }: { label: string; uri?: string }) {
  const value = (uri || "").trim();
  const parsed = value ? parseDataUrl(value) : null;
  const kind = parsed ? fileKind(parsed.mime) : "other";
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const textBody =
    parsed && kind === "text"
      ? (() => {
          try {
            return decodeBase64Text(parsed.base64);
          } catch {
            return "";
          }
        })()
      : "";
  const canPreview = kind === "image" || kind === "pdf" || kind === "text" || kind === "docx";

  return (
    <View>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 11,
          fontWeight: "700",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </Text>
      {!parsed ? (
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Not provided</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {kind === "image" ? (
            <Image
              source={{ uri: value }}
              resizeMode="contain"
              style={{
                width: "100%",
                height: 180,
                borderRadius: 10,
                backgroundColor: colors.bgSurface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
          ) : (
            <Text style={{ color: colors.text, fontSize: 13 }}>{fileTypeLabel(kind)} attached</Text>
          )}
          {kind === "text" && textBody ? (
            <Text style={{ color: colors.text, fontSize: 13 }} numberOfLines={6}>
              {textBody}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {canPreview ? (
              <Pressable
                onPress={() => setPreviewOpen(true)}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.accent,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
                  Preview
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              disabled={saving}
              onPress={() => {
                setSaving(true);
                void downloadDataUrl(value, label).finally(() => setSaving(false));
              }}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 12,
                paddingVertical: 6,
                opacity: saving ? 0.6 : 1,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
                {saving ? "Saving…" : "Download"}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
      <Modal visible={previewOpen} animationType="slide" onRequestClose={() => setPreviewOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top", "bottom"]}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>{label}</Text>
            <Pressable onPress={() => setPreviewOpen(false)} hitSlop={8}>
              <Text style={{ color: colors.accent, fontWeight: "700" }}>Close</Text>
            </Pressable>
          </View>
          {kind === "image" ? (
            <Image source={{ uri: value }} resizeMode="contain" style={{ flex: 1, backgroundColor: "#F4F7FB" }} />
          ) : kind === "text" ? (
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={{ color: colors.text, fontSize: 14 }}>{textBody || "Empty file."}</Text>
            </ScrollView>
          ) : kind === "pdf" || kind === "docx" ? (
            <WebView
              originWhitelist={["*"]}
              source={{ html: previewHtml(kind, parsed?.base64 || "") }}
              style={{ flex: 1 }}
            />
          ) : (
            <Text style={{ color: colors.textMuted, padding: 16 }}>
              Preview is not available for this file. Use Download to open it.
            </Text>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function CopyableAccessKey({
  code,
  label = "Access key",
}: {
  code: string;
  label?: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <Text
        style={{
          color: colors.text,
          fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
          flexShrink: 1,
        }}
      >
        {label ? `${label}: ${code}` : code}
      </Text>
      <Pressable
        onPress={() => {
          void copyToClipboard(code).then((result) => {
            if (result.ok) toast.success("Access key copied.", { title: "Copied" });
            else toast.error(result.message || "Could not copy.");
          });
        }}
        accessibilityLabel="Copy access key"
        hitSlop={8}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bgSurface,
        }}
      >
        <CopyIcon size={12} color={colors.accent} />
        <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "700" }}>
          Copy
        </Text>
      </Pressable>
    </View>
  );
}

async function photoDataUrl(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    toast.error("Photo library permission is required.");
    return null;
  }
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
  });
  if (picked.canceled || !picked.assets[0]) return null;
  const asset = picked.assets[0];
  const wide = (asset.width ?? 0) >= (asset.height ?? 0);
  const longEdge = Math.max(asset.width ?? 0, asset.height ?? 0);
  const prepared = await ImageManipulator.manipulateAsync(
    asset.uri,
    longEdge > 1280
      ? [{ resize: wide ? { width: 1280 } : { height: 1280 } }]
      : [],
    { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  if (!prepared.base64) return null;
  return `data:image/jpeg;base64,${prepared.base64}`;
}

const BUSINESS_DOC_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { margin: 0; font-family: sans-serif; background: transparent; }
  button {
    width: 100%;
    height: 44px;
    border: 0;
    border-radius: 10px;
    background: #2F80ED;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
  }
</style>
</head>
<body>
<button type="button" id="choose">Choose file</button>
<input id="file" type="file" accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,.doc,.docx,.txt" hidden />
<script>
  const input = document.getElementById("file");
  function mimeFor(name, type) {
    const given = (type || "").toLowerCase();
    if (given) return given;
    const lower = (name || "").toLowerCase();
    if (lower.endsWith(".pdf")) return "application/pdf";
    if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (lower.endsWith(".doc")) return "application/msword";
    if (lower.endsWith(".txt")) return "text/plain";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    return "";
  }
  function allowed(mime) {
    return mime.indexOf("image/") === 0 ||
      mime === "application/pdf" ||
      mime === "application/msword" ||
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mime === "text/plain";
  }
  function send(payload) {
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }
  document.getElementById("choose").onclick = function () { input.click(); };
  input.onchange = function () {
    const file = input.files && input.files[0];
    if (!file) {
      send({ canceled: true });
      return;
    }
    const mime = mimeFor(file.name, file.type);
    if (!allowed(mime)) {
      send({ error: "type" });
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      let dataUrl = String(reader.result || "");
      const comma = dataUrl.indexOf(",");
      if (comma >= 0 && dataUrl.slice(0, 5) === "data:" && !file.type) {
        dataUrl = "data:" + mime + ";base64," + dataUrl.slice(comma + 1);
      }
      if (dataUrl.length > 1500000) {
        send({ error: "size" });
        return;
      }
      send({ dataUrl: dataUrl });
    };
    reader.onerror = function () { send({ error: "read" }); };
    reader.readAsDataURL(file);
  };
</script>
</body>
</html>`;

type BusinessDocMessage = {
  dataUrl?: string;
  canceled?: boolean;
  error?: string;
};

let openBusinessDocPicker: (() => void) | null = null;
let deliverBusinessDoc: ((message: BusinessDocMessage) => void) | null = null;

function businessDataUrl(): Promise<string | null> {
  if (!openBusinessDocPicker) {
    toast.error("Open the access screen, then choose the business document again.");
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    deliverBusinessDoc = (message) => {
      deliverBusinessDoc = null;
      if (message.canceled) {
        resolve(null);
        return;
      }
      if (message.error === "type") {
        toast.error("Business document must be an image, PDF, Word document, or text file.");
        resolve(null);
        return;
      }
      if (message.error === "size") {
        toast.error("Business document is too large.");
        resolve(null);
        return;
      }
      if (message.error || !message.dataUrl) {
        toast.error("Could not read the file.");
        resolve(null);
        return;
      }
      resolve(message.dataUrl);
    };
    openBusinessDocPicker?.();
  });
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        color: colors.textMuted,
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 0.6,
        textTransform: "uppercase",
        marginBottom: 6,
      }}
    >
      {children}
    </Text>
  );
}

type AccessCodesScreenProps = {
  /** When true, render as a panel inside Access (no back header / outer chrome). */
  embedded?: boolean;
};

export default function AccessCodesScreen({
  embedded = false,
}: AccessCodesScreenProps) {
  const { user } = useAuth();
  const canInvite = String(user?.role ?? "").toLowerCase() === "administrator";
  const [tab, setTab] = useState<Tab>(canInvite ? "invite" : "place");
  const [rows, setRows] = useState<UniversalAccessRequestRow[]>([]);
  const [zones, setZones] = useState<UniversalAccessZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [detail, setDetail] = useState<UniversalAccessRequestRow | null>(null);
  const [editing, setEditing] = useState<UniversalAccessRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [editPhoto, setEditPhoto] = useState("");
  const [editBusinessDoc, setEditBusinessDoc] = useState("");

  const [keyType, setKeyType] = useState<"private" | "public">("private");
  const [inviteeEmail, setInviteeEmail] = useState("");
  const [invitee, setInvitee] = useState<UniversalAccessInvitee | null>(null);
  const [inviteeMatches, setInviteeMatches] = useState<UniversalAccessInvitee[]>([]);
  const [selectedZoneIds, setSelectedZoneIds] = useState<number[]>([]);
  const [inviteNote, setInviteNote] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [inviteAwaitingReview, setInviteAwaitingReview] = useState(false);
  const [inviteReadyToRefresh, setInviteReadyToRefresh] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all");

  const [networkQuery, setNetworkQuery] = useState("");
  const [target, setTarget] = useState<UniversalAccessTargetNetwork | null>(null);
  const [targetMatches, setTargetMatches] = useState<UniversalAccessTargetNetwork[]>([]);
  const [placeZoneIds, setPlaceZoneIds] = useState<number[]>([]);
  const [placeNote, setPlaceNote] = useState("");
  const [photo, setPhoto] = useState("");
  const [businessDoc, setBusinessDoc] = useState("");
  const [docPickerOpen, setDocPickerOpen] = useState(false);

  useEffect(() => {
    openBusinessDocPicker = () => setDocPickerOpen(true);
    return () => {
      openBusinessDocPicker = null;
      if (deliverBusinessDoc) {
        const finish = deliverBusinessDoc;
        deliverBusinessDoc = null;
        finish({ canceled: true });
      }
    };
  }, []);

  const profile = useMemo(
    () => ({
      firstName: String((user as { firstName?: string; first_name?: string } | null)?.firstName
        ?? (user as { first_name?: string } | null)?.first_name
        ?? ""),
      lastName: String((user as { lastName?: string; last_name?: string } | null)?.lastName
        ?? (user as { last_name?: string } | null)?.last_name
        ?? ""),
      email: String(user?.email ?? ""),
      address: String((user as { address?: string } | null)?.address ?? ""),
    }),
    [user],
  );

  const tabs = useMemo(
    () => [
      ...(canInvite ? [{ key: "invite" as const, label: "Key Invitation" }] : []),
      { key: "place" as const, label: "Request Key" },
      { key: "list" as const, label: "Request List" },
    ],
    [canInvite],
  );

  const reload = useCallback(async () => {
    const [requestResult, zoneResult] = await Promise.all([
      listUniversalAccessRequests(),
      canInvite
        ? listShareableUniversalZones()
        : Promise.resolve({ data: [] as UniversalAccessZone[], error: null }),
    ]);
    if (requestResult.error) toast.error(requestResult.error);
    if (zoneResult.error) toast.error(zoneResult.error);
    setRows(requestResult.data ?? []);
    setZones(zoneResult.data ?? []);
  }, [canInvite]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void reload().finally(() => setLoading(false));
    }, [reload]),
  );

  useEffect(() => {
    if (inviteReadyToRefresh || keyType !== "private") {
      setInviteeMatches([]);
      return;
    }
    if (invitee && invitee.email === inviteeEmail.trim()) {
      setInviteeMatches([]);
      return;
    }
    const query = inviteeEmail.trim();
    if (query.length < 2) {
      setInviteeMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchUniversalAccessInvitees(query).then((result) => {
        setInviteeMatches(Array.isArray(result.data) ? result.data.slice(0, 5) : []);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [invitee, inviteeEmail, keyType, inviteReadyToRefresh]);

  useEffect(() => {
    if (target && target.network_id === networkQuery.trim()) {
      setTargetMatches([]);
      return;
    }
    const query = networkQuery.trim();
    if (query.length < 2) {
      setTargetMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchUniversalAccessTargets(query).then((result) => {
        setTargetMatches(Array.isArray(result.data) ? result.data : []);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [networkQuery, target]);

  function toggleZone(id: number, current: number[], setter: (next: number[]) => void) {
    setter(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function resetInviteForm() {
    setKeyType("private");
    setInvitee(null);
    setInviteeEmail("");
    setInviteeMatches([]);
    setSelectedZoneIds([]);
    setInviteNote("");
    setGeneratedCode(null);
    setInviteAwaitingReview(false);
    setInviteReadyToRefresh(false);
  }

  function resetPlaceForm() {
    setNetworkQuery("");
    setTarget(null);
    setTargetMatches([]);
    setPlaceZoneIds([]);
    setPlaceNote("");
    setPhoto("");
    setBusinessDoc("");
  }

  async function onSubmitInvite() {
    if (inviteReadyToRefresh) {
      resetInviteForm();
      return;
    }
    if (keyType === "private" && !invitee) {
      toast.error("Pick an invitee from the search results.");
      return;
    }
    if (selectedZoneIds.length === 0) {
      toast.error("Select at least one zone.");
      return;
    }
    setSubmitting(true);
    const result = await createInviteUniversalAccessRequest({
      key_type: keyType,
      invitee_email: keyType === "private" ? invitee?.email : undefined,
      zone_ids: selectedZoneIds,
      note: inviteNote.trim(),
    });
    setSubmitting(false);
    if (result.error || !result.data) {
      toast.error(result.error || "Could not generate the access key.");
      return;
    }
    setGeneratedCode(result.data.code ?? null);
    const awaiting = result.data.status === "pending" && keyType === "private";
    setInviteAwaitingReview(awaiting);
    setInviteReadyToRefresh(true);
    toast.success(awaiting ? "Sent for the user to review." : "Access key generated.");
    await reload();
  }

  async function onSubmitPlace() {
    if (!target) {
      toast.error("Select a network ID first.");
      return;
    }
    if (placeZoneIds.length === 0) {
      toast.error("Select at least one zone.");
      return;
    }
    if (!photo || !businessDoc) {
      toast.error("Photo ID and business document are required.");
      return;
    }
    setSubmitting(true);
    const result = await createPlaceAccessUniversalRequest({
      network_id: target.network_id,
      zone_ids: placeZoneIds,
      photo_id: photo,
      business_document: businessDoc,
      note: placeNote.trim(),
    });
    setSubmitting(false);
    if (result.error || !result.data) {
      toast.error(result.error || "Could not submit the request.");
      return;
    }
    toast.success("Request sent.");
    resetPlaceForm();
    setTab("list");
    await reload();
  }

  const pageMarkers = (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignSelf: "flex-start",
        gap: 2,
        marginBottom: -1,
        zIndex: 2,
      }}
    >
      {tabs.map((item) => {
        const active = tab === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => setTab(item.key)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderWidth: 1,
              borderBottomWidth: active ? 0 : 1,
              borderColor: colors.border,
              backgroundColor: active ? colors.bgCard : colors.bgSurface,
              marginBottom: active ? 0 : 1,
            }}
          >
            <Text
              style={{
                color: active ? colors.accent : colors.textMuted,
                fontWeight: "700",
                fontSize: 12,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  // Flush page-marker sheet: square top-left so the first marker meets the card.
  const sheetCardCorners = {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  } as const;

  const panel = (
    <>
          {!embedded ? (
            <ScreenHeader
              title="Zone Management"
              subtitle="Invite, request, and manage keys"
              showBack
            />
          ) : null}

          <ScrollView
            style={embedded ? { flex: 1 } : undefined}
            nestedScrollEnabled
            contentContainerStyle={{ paddingBottom: embedded ? 40 : 120 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor={colors.accent}
                colors={[colors.accent]}
                onRefresh={() => {
                  setRefreshing(true);
                  void reload().finally(() => setRefreshing(false));
                }}
              />
            }
          >
            {loading ? (
              <ActivityIndicator style={{ marginTop: 24 }} color={colors.accent} />
            ) : null}

            {!loading ? (
              <View style={{ paddingHorizontal: 20, marginTop: 4 }}>
                {pageMarkers}
                {canInvite && tab === "invite" ? (
                <Card
                  style={{
                    gap: 12,
                    marginTop: 0,
                    ...sheetCardCorners,
                  }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    Generate a private or public universal access key for your zones.
                  </Text>
                  <View style={{ flexDirection: "row", gap: 16 }}>
                    {(["private", "public"] as const).map((value) => (
                      <Pressable
                        key={value}
                        disabled={inviteReadyToRefresh}
                        onPress={() => {
                          setKeyType(value);
                          if (value === "public") {
                            setInvitee(null);
                            setInviteeEmail("");
                          }
                        }}
                        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                      >
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            borderWidth: 2,
                            borderColor: colors.accent,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {keyType === value ? (
                            <View
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 5,
                                backgroundColor: colors.accent,
                              }}
                            />
                          ) : null}
                        </View>
                        <Text style={{ color: colors.text, fontWeight: "600" }}>
                          {value === "private" ? "Private" : "Public"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {keyType === "private" ? (
                    <View style={{ zIndex: inviteeMatches.length > 0 ? 20 : 1 }}>
                      <FieldLabel>Invitee email</FieldLabel>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          borderWidth: 1.5,
                          borderColor: invitee
                            ? "#16A34A"
                            : inviteeMatches.length > 0
                              ? colors.accent
                              : colors.border,
                          borderRadius: 12,
                          backgroundColor: invitee
                            ? "rgba(22,163,74,0.06)"
                            : colors.bgCard,
                          paddingHorizontal: 10,
                          minHeight: 44,
                        }}
                      >
                        {invitee ? (
                          <Check size={15} color="#16A34A" />
                        ) : (
                          <Search
                            size={15}
                            color={
                              inviteeMatches.length > 0
                                ? colors.accent
                                : colors.textMuted
                            }
                          />
                        )}
                        <TextInput
                          value={inviteeEmail}
                          editable={!inviteReadyToRefresh}
                          onChangeText={(value) => {
                            setInviteeEmail(value);
                            setInvitee(null);
                          }}
                          autoCapitalize="none"
                          keyboardType="email-address"
                          placeholder="Search other-network users…"
                          placeholderTextColor={colors.textMuted}
                          style={{
                            flex: 1,
                            paddingHorizontal: 8,
                            paddingVertical: 10,
                            color: colors.text,
                            fontSize: 13,
                          }}
                        />
                        {invitee ? (
                          <Text
                            style={{
                              color: "#16A34A",
                              fontSize: 11,
                              fontWeight: "700",
                            }}
                          >
                            Selected
                          </Text>
                        ) : null}
                      </View>
                      {inviteeMatches.length > 0 ? (
                        <View
                          style={{
                            marginTop: 6,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: "#fff",
                            overflow: "hidden",
                            shadowColor: "#0F2C5C",
                            shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: 0.12,
                            shadowRadius: 16,
                            elevation: 6,
                          }}
                        >
                          <View
                            style={{
                              paddingHorizontal: 16,
                              paddingVertical: 12,
                              borderBottomWidth: 1,
                              borderBottomColor: colors.border,
                              backgroundColor: colors.bgSurface,
                            }}
                          >
                            <Text
                              style={{
                                color: colors.textMuted,
                                fontSize: 11,
                                fontWeight: "700",
                                letterSpacing: 0.4,
                              }}
                            >
                              {inviteeMatches.length} match
                              {inviteeMatches.length === 1 ? "" : "es"} · other
                              networks
                            </Text>
                          </View>
                          {inviteeMatches.map((match, matchIndex) => {
                            const isLast =
                              matchIndex === inviteeMatches.length - 1;
                            return (
                              <Pressable
                                key={match.id}
                                onPress={() => {
                                  setInvitee(match);
                                  setInviteeEmail(match.email);
                                  setInviteeMatches([]);
                                }}
                                style={{
                                  paddingHorizontal: 16,
                                  paddingVertical: 14,
                                  backgroundColor: "#fff",
                                  borderBottomWidth: isLast ? 0 : 1,
                                  borderBottomColor: colors.border,
                                }}
                              >
                                <Text
                                  style={{
                                    color: colors.text,
                                    fontWeight: "700",
                                    fontSize: 13,
                                  }}
                                >
                                  {match.email}
                                </Text>
                                <Text
                                  style={{
                                    color: colors.textMuted,
                                    fontSize: 12,
                                    marginTop: 4,
                                  }}
                                  numberOfLines={1}
                                >
                                  {[match.name, match.network_id]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  <View>
                    <FieldLabel>Zones to share</FieldLabel>
                    {zones.map((zone) => (
                      <Pressable
                        key={zone.id}
                        disabled={inviteReadyToRefresh}
                        onPress={() =>
                          toggleZone(zone.id, selectedZoneIds, setSelectedZoneIds)
                        }
                        style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}
                      >
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            borderWidth: 1,
                            borderColor: colors.accent,
                            backgroundColor: selectedZoneIds.includes(zone.id)
                              ? colors.accent
                              : "transparent",
                          }}
                        />
                        <Text style={{ color: colors.text }}>{zone.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    value={inviteNote}
                    editable={!inviteReadyToRefresh}
                    onChangeText={setInviteNote}
                    placeholder="Note"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: colors.text,
                      minHeight: 72,
                      textAlignVertical: "top",
                    }}
                  />
                  {generatedCode ? (
                    <CopyableAccessKey code={generatedCode} />
                  ) : null}
                  {inviteAwaitingReview ? (
                    <Text style={{ color: "#9A6410", fontSize: 13 }}>
                      Sent for review. The selected user must accept before this key is added to their zones.
                    </Text>
                  ) : null}
                  <Button
                    label={
                      submitting
                        ? "Working…"
                        : inviteReadyToRefresh
                          ? "Refresh"
                          : "Generate"
                    }
                    size="sm"
                    fullWidth
                    disabled={submitting}
                    onPress={() => void onSubmitInvite()}
                  />
                </Card>
                ) : null}

                {tab === "place" ? (
                <Card
                  style={{
                    gap: 12,
                    marginTop: 0,
                    ...sheetCardCorners,
                  }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    Request access to another network. Their admin reviews your request.
                  </Text>
                  <View style={{ zIndex: targetMatches.length > 0 ? 20 : 1 }}>
                    <FieldLabel>Network ID</FieldLabel>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        borderWidth: 1.5,
                        borderColor: target
                          ? "#16A34A"
                          : targetMatches.length > 0
                            ? colors.accent
                            : colors.border,
                        borderRadius: 12,
                        backgroundColor: target
                          ? "rgba(22,163,74,0.06)"
                          : "#fff",
                        paddingHorizontal: 10,
                        minHeight: 44,
                      }}
                    >
                      {target ? (
                        <Check size={15} color="#16A34A" />
                      ) : (
                        <Search
                          size={15}
                          color={
                            targetMatches.length > 0
                              ? colors.accent
                              : colors.textMuted
                          }
                        />
                      )}
                      <TextInput
                        value={networkQuery}
                        onChangeText={(value) => {
                          setNetworkQuery(value);
                          setTarget(null);
                          setPlaceZoneIds([]);
                        }}
                        autoCapitalize="characters"
                        placeholder="Search other networks…"
                        placeholderTextColor={colors.textMuted}
                        style={{
                          flex: 1,
                          paddingHorizontal: 8,
                          paddingVertical: 10,
                          color: colors.text,
                          fontSize: 13,
                        }}
                      />
                      {target ? (
                        <Text
                          style={{
                            color: "#16A34A",
                            fontSize: 11,
                            fontWeight: "700",
                          }}
                        >
                          Selected
                        </Text>
                      ) : null}
                    </View>
                    {targetMatches.length > 0 ? (
                      <View
                        style={{
                          marginTop: 6,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: "#fff",
                          overflow: "hidden",
                          shadowColor: "#0F2C5C",
                          shadowOffset: { width: 0, height: 8 },
                          shadowOpacity: 0.12,
                          shadowRadius: 16,
                          elevation: 6,
                        }}
                      >
                        <View
                          style={{
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.border,
                            backgroundColor: colors.bgSurface,
                          }}
                        >
                          <Text
                            style={{
                              color: colors.textMuted,
                              fontSize: 11,
                              fontWeight: "700",
                              letterSpacing: 0.4,
                            }}
                          >
                            {targetMatches.length} match
                            {targetMatches.length === 1 ? "" : "es"} · other
                            networks
                          </Text>
                        </View>
                        {targetMatches.map((match, matchIndex) => {
                          const isLast =
                            matchIndex === targetMatches.length - 1;
                          return (
                            <Pressable
                              key={match.network_id}
                              onPress={() => {
                                setTarget(match);
                                setNetworkQuery(match.network_id);
                                setTargetMatches([]);
                                setPlaceZoneIds([]);
                              }}
                              style={{
                                paddingHorizontal: 16,
                                paddingVertical: 14,
                                backgroundColor: "#fff",
                                borderBottomWidth: isLast ? 0 : 1,
                                borderBottomColor: colors.border,
                              }}
                            >
                              <Text
                                style={{
                                  color: colors.text,
                                  fontWeight: "700",
                                  fontSize: 13,
                                }}
                              >
                                {match.network_id}
                              </Text>
                              <Text
                                style={{
                                  color: colors.textMuted,
                                  fontSize: 12,
                                  marginTop: 4,
                                }}
                                numberOfLines={1}
                              >
                                {match.admin_name} · {match.admin_email}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                  <View>
                    <FieldLabel>Zone name</FieldLabel>
                    {!target ? (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 12,
                          paddingHorizontal: 14,
                          paddingVertical: 14,
                          backgroundColor: colors.bgSurface,
                        }}
                      >
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                          Select a network first to choose zones.
                        </Text>
                      </View>
                    ) : (target.zones ?? []).length === 0 ? (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 12,
                          paddingHorizontal: 14,
                          paddingVertical: 14,
                          backgroundColor: colors.bgSurface,
                        }}
                      >
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                          No shareable zones on this network.
                        </Text>
                      </View>
                    ) : (
                      <View
                        style={{
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor:
                            placeZoneIds.length > 0
                              ? colors.accent
                              : colors.border,
                          backgroundColor: "#fff",
                          overflow: "hidden",
                        }}
                      >
                        <View
                          style={{
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.border,
                            backgroundColor: colors.bgSurface,
                          }}
                        >
                          <Text
                            style={{
                              color: colors.textMuted,
                              fontSize: 11,
                              fontWeight: "700",
                              letterSpacing: 0.4,
                            }}
                          >
                            {placeZoneIds.length} selected ·{" "}
                            {target.zones.length} available
                          </Text>
                        </View>
                        {target.zones.map((zone, zoneIndex) => {
                          const selected = placeZoneIds.includes(zone.id);
                          const isLast =
                            zoneIndex === target.zones.length - 1;
                          const meta = [
                            zone.zone_type,
                            zone.is_primary ? "primary" : null,
                            zone.communal ? "communal" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ");
                          return (
                            <Pressable
                              key={zone.id}
                              onPress={() =>
                                toggleZone(
                                  zone.id,
                                  placeZoneIds,
                                  setPlaceZoneIds,
                                )
                              }
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 12,
                                paddingHorizontal: 16,
                                paddingVertical: 14,
                                backgroundColor: selected
                                  ? "rgba(47,128,237,0.06)"
                                  : "#fff",
                                borderBottomWidth: isLast ? 0 : 1,
                                borderBottomColor: colors.border,
                              }}
                            >
                              <View
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 6,
                                  borderWidth: 1.5,
                                  borderColor: selected
                                    ? colors.accent
                                    : colors.border,
                                  backgroundColor: selected
                                    ? colors.accent
                                    : "#fff",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {selected ? (
                                  <Check size={13} color="#fff" />
                                ) : null}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={{
                                    color: colors.text,
                                    fontWeight: "700",
                                    fontSize: 13,
                                  }}
                                >
                                  {zone.name}
                                </Text>
                                {meta ? (
                                  <Text
                                    style={{
                                      color: colors.textMuted,
                                      fontSize: 12,
                                      marginTop: 3,
                                    }}
                                  >
                                    {meta}
                                  </Text>
                                ) : null}
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </View>
                  <View>
                    <FieldLabel>Network admin email</FieldLabel>
                    <TextInput
                      value={target?.admin_email ?? ""}
                      editable={false}
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        color: colors.textMuted,
                        backgroundColor: colors.bgSurface,
                      }}
                    />
                  </View>
                  {[
                    ["First name", profile.firstName],
                    ["Last name", profile.lastName],
                    ["Email", profile.email],
                    ["Address", profile.address],
                  ].map(([label, value]) => (
                    <View key={label}>
                      <FieldLabel>{label}</FieldLabel>
                      <TextInput
                        value={value}
                        editable={false}
                        style={{
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          color: colors.textMuted,
                          backgroundColor: colors.bgSurface,
                        }}
                      />
                    </View>
                  ))}
                  <Button
                    label={photo ? "Replace photo ID" : "Add photo ID"}
                    variant="outline"
                    size="sm"
                    fullWidth
                    onPress={() => {
                      void photoDataUrl().then((url) => {
                        if (url) setPhoto(url);
                      });
                    }}
                  />
                  {photo ? (
                    <Image source={{ uri: photo }} style={{ width: 120, height: 84, borderRadius: 8 }} />
                  ) : null}
                  <Button
                    label={businessDoc ? "Replace business document" : "Add business document"}
                    variant="outline"
                    size="sm"
                    fullWidth
                    onPress={() => {
                      void businessDataUrl().then((url) => {
                        if (url) setBusinessDoc(url);
                      });
                    }}
                  />
                  {businessDoc ? (
                    <ReviewDocument label="Business document" uri={businessDoc} />
                  ) : null}
                  <TextInput
                    value={placeNote}
                    onChangeText={setPlaceNote}
                    placeholder="Note"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: colors.text,
                      minHeight: 72,
                      textAlignVertical: "top",
                    }}
                  />
                  <Button
                    label={submitting ? "Sending…" : "Send request"}
                    size="sm"
                    fullWidth
                    disabled={submitting}
                    onPress={() => void onSubmitPlace()}
                  />
                </Card>
                ) : null}

                {tab === "list" ? (
              <View style={{ gap: 10, marginTop: 0 }}>
                <Card
                  style={{
                    gap: 10,
                    marginTop: 0,
                    ...sheetCardCorners,
                  }}
                >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 2,
                  }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    Pull down to refresh
                  </Text>
                  <Pressable
                    onPress={() => {
                      setRefreshing(true);
                      void reload().finally(() => setRefreshing(false));
                    }}
                    disabled={refreshing}
                    hitSlop={8}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      opacity: refreshing ? 0.6 : 1,
                    }}
                  >
                    <RefreshIcon size={14} color={colors.accent} />
                    <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
                      {refreshing ? "Refreshing…" : "Refresh"}
                    </Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {(
                    [
                      ["all", "All"],
                      ["pending", "Pending"],
                      ["approved", "Approved"],
                      ["rejected", "Rejected"],
                    ] as const
                  ).map(([value, label]) => {
                    const active = statusFilter === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => setStatusFilter(value)}
                        style={{
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? colors.accent : colors.border,
                          backgroundColor: active ? colors.accent : "transparent",
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                        }}
                      >
                        <Text
                          style={{
                            color: active ? "#fff" : colors.textMuted,
                            fontSize: 12,
                            fontWeight: "700",
                          }}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {rows.filter((row) => statusFilter === "all" || row.status === statusFilter)
                  .length === 0 ? (
                  <Text style={{ color: colors.textMuted }}>Nothing here yet.</Text>
                ) : null}
                {rows
                  .filter((row) => statusFilter === "all" || row.status === statusFilter)
                  .map((row, index, visibleRows) => {
                  const actions = row.viewer_actions;
                  const showSenderReview =
                    row.viewer_role === "requester" && row.status === "pending";
                  const isLast = index === visibleRows.length - 1;
                  return (
                    <View
                      key={row.id}
                      style={{
                        gap: 6,
                        paddingBottom: isLast ? 0 : 10,
                        borderBottomWidth: isLast ? 0 : 1,
                        borderBottomColor: colors.border,
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: "800" }}>
                        {row.request_kind === "place_access" ? "Request Key" : "Key Invitation"}
                        {row.key_type ? ` · ${row.key_type}` : ""}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString()
                          : "—"}
                      </Text>
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: 12,
                          fontWeight: "700",
                          textTransform: "capitalize",
                        }}
                      >
                        {row.status}
                      </Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                        {row.status === "approved" &&
                        row.credential_id != null &&
                        row.viewer_role === "owner" ? (
                          <Button
                            label={row.enabled ? "Turn off" : "Turn on"}
                            size="sm"
                            tone={row.enabled ? "amber" : "green"}
                            disabled={busyId === row.id}
                            onPress={() => {
                              setBusyId(row.id);
                              void setUniversalAccessEnabled(
                                row.credential_id!,
                                !row.enabled,
                              ).then(() => reload().finally(() => setBusyId(null)));
                            }}
                          />
                        ) : null}
                        {actions?.can_approve ||
                        actions?.can_reject ||
                        showSenderReview ? (
                          <Button
                            label="Review"
                            size="sm"
                            tone="blue"
                            onPress={() => {
                              void getUniversalAccessRequest(row.id).then((result) => {
                                setDetail(result.data ?? row);
                                setRejectReason("");
                              });
                            }}
                          />
                        ) : null}
                        {actions?.can_edit_docs && row.status === "pending" ? (
                          <Button
                            label="Edit"
                            size="sm"
                            tone="amber"
                            onPress={() => {
                              void getUniversalAccessRequest(row.id).then((result) => {
                                const full = result.data ?? row;
                                setEditing(full);
                                setEditPhoto(full.photo_id || "");
                                setEditBusinessDoc(full.business_document || "");
                              });
                            }}
                          />
                        ) : null}
                        {actions?.can_remove ? (
                          <Button
                            label="Remove"
                            size="sm"
                            tone="red"
                            disabled={busyId === row.id}
                            onPress={() => {
                              setBusyId(row.id);
                              void deleteUniversalAccessRequest(row.id).then((result) => {
                                setBusyId(null);
                                if (result.error) toast.error(result.error);
                                else void reload();
                              });
                            }}
                          />
                        ) : null}
                        {!(actions?.can_approve || actions?.can_reject) &&
                        !(actions?.can_edit_docs && row.status === "pending") ? (
                          <Button
                            label="Detail"
                            size="sm"
                            tone="slate"
                            onPress={() => {
                              void getUniversalAccessRequest(row.id).then((result) => {
                                setDetail(result.data ?? row);
                              });
                            }}
                          />
                        ) : null}
                      </View>
                    </View>
                  );
                })}
                </Card>
              </View>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

        <Modal
          visible={detail != null}
          transparent
          animationType="fade"
          onRequestClose={() => setDetail(null)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.45)",
              justifyContent: "center",
              padding: 20,
            }}
            onPress={() => setDetail(null)}
          >
            <View onStartShouldSetResponder={() => true}>
            <Card padded={false}>
              <ScrollView
                style={{ maxHeight: 560 }}
                contentContainerStyle={{ gap: 10, padding: 18 }}
                showsVerticalScrollIndicator
              >
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>
                {detail?.request_kind === "place_access" ? "Request Key" : "Key Invitation"}
                {detail?.key_type ? ` · ${detail.key_type}` : ""}
              </Text>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 12,
                  fontWeight: "700",
                  textTransform: "capitalize",
                }}
              >
                {detail?.status}
                {detail?.created_at
                  ? ` · ${new Date(detail.created_at).toLocaleString()}`
                  : ""}
              </Text>
              {detail?.request_kind === "invite" &&
              detail?.key_type === "private" &&
              detail?.email ? (
                <View>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      fontWeight: "700",
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    Invited user
                  </Text>
                  <Text style={{ color: colors.text }}>{detail.email}</Text>
                  {detail.member_name ? (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {detail.member_name}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <View>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 11,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Zones
                </Text>
                <Text style={{ color: colors.text }}>
                  {(detail?.zones ?? []).map((zone) => zone.name).join(", ") ||
                    detail?.place ||
                    "No zones"}
                  {detail?.network_id ? (
                    <Text style={{ color: colors.textMuted }}>
                      {` · ${detail.network_id}`}
                    </Text>
                  ) : null}
                </Text>
              </View>
              {detail?.request_kind === "place_access" ? (
                <>
                  <View>
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: 11,
                        fontWeight: "700",
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      Requester
                    </Text>
                    <Text style={{ color: colors.text }}>
                      <Text style={{ fontWeight: "700" }}>
                        {[detail.first_name, detail.last_name].filter(Boolean).join(" ") ||
                          detail.member_name ||
                          "—"}
                      </Text>
                      {detail.email ? ` · ${detail.email}` : ""}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                      {detail.address || "No address"}
                    </Text>
                  </View>
                  {detail.note ? (
                    <View>
                      <Text
                        style={{
                          color: colors.textMuted,
                          fontSize: 11,
                          fontWeight: "700",
                          textTransform: "uppercase",
                          marginBottom: 4,
                        }}
                      >
                        Note
                      </Text>
                      <Text style={{ color: colors.text }}>{detail.note}</Text>
                    </View>
                  ) : null}
                  <ReviewDocument label="Photo ID" uri={detail.photo_id} />
                  <ReviewDocument
                    label="Business document"
                    uri={detail.business_document}
                  />
                </>
              ) : null}
              {detail?.code ? (
                <View>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      fontWeight: "700",
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    Access key
                  </Text>
                  <CopyableAccessKey code={detail.code} label="" />
                </View>
              ) : null}
              {detail?.viewer_actions?.can_approve || detail?.viewer_actions?.can_reject ? (
                <>
                  <Button
                    label="Approve"
                    size="sm"
                    fullWidth
                    tone="green"
                    disabled={busyId === detail?.id}
                    onPress={() => {
                      if (!detail) return;
                      setBusyId(detail.id);
                      void approveUniversalAccessRequest(detail.id).then((result) => {
                        setBusyId(null);
                        if (result.error) toast.error(result.error);
                        else {
                          setDetail(null);
                          void reload();
                        }
                      });
                    }}
                  />
                  <TextInput
                    value={rejectReason}
                    onChangeText={setRejectReason}
                    placeholder="Reject reason (optional)"
                    placeholderTextColor={colors.textMuted}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: colors.text,
                    }}
                  />
                  <Button
                    label="Reject"
                    size="sm"
                    fullWidth
                    tone="red"
                    disabled={busyId === detail?.id}
                    onPress={() => {
                      if (!detail) return;
                      setBusyId(detail.id);
                      void rejectUniversalAccessRequest(detail.id, rejectReason.trim()).then(
                        (result) => {
                          setBusyId(null);
                          if (result.error) toast.error(result.error);
                          else {
                            setDetail(null);
                            void reload();
                          }
                        },
                      );
                    }}
                  />
                </>
              ) : null}
              <Button label="Close" size="sm" fullWidth variant="outline" onPress={() => setDetail(null)} />
              </ScrollView>
            </Card>
            </View>
          </Pressable>
        </Modal>

        <Modal
          visible={editing != null}
          transparent
          animationType="fade"
          onRequestClose={() => setEditing(null)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.45)",
              justifyContent: "center",
              padding: 20,
            }}
            onPress={() => setEditing(null)}
          >
            <View onStartShouldSetResponder={() => true}>
            <Card style={{ gap: 10 }}>
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>
                Edit documents
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                Only photo ID and business document can be changed while pending.
              </Text>
              {editPhoto ? <ReviewDocument label="Photo ID" uri={editPhoto} /> : null}
              {editBusinessDoc ? (
                <ReviewDocument label="Business document" uri={editBusinessDoc} />
              ) : null}
              <Button
                label={editPhoto ? "Replace photo ID" : "Add photo ID"}
                variant="outline"
                size="sm"
                fullWidth
                onPress={() => {
                  void photoDataUrl().then((url) => {
                    if (url) setEditPhoto(url);
                  });
                }}
              />
              <Button
                label={editBusinessDoc ? "Replace business document" : "Add business document"}
                variant="outline"
                size="sm"
                fullWidth
                onPress={() => {
                  void businessDataUrl().then((url) => {
                    if (url) setEditBusinessDoc(url);
                  });
                }}
              />
              <Button
                label="Save"
                size="sm"
                fullWidth
                disabled={busyId === editing?.id}
                onPress={() => {
                  if (!editing) return;
                  if (!editPhoto || !editBusinessDoc) {
                    toast.error("Photo ID and business document are required.");
                    return;
                  }
                  setBusyId(editing.id);
                  void updateUniversalAccessDocs(editing.id, {
                    photo_id: editPhoto,
                    business_document: editBusinessDoc,
                  }).then((result) => {
                    setBusyId(null);
                    if (result.error) toast.error(result.error);
                    else {
                      setEditing(null);
                      void reload();
                    }
                  });
                }}
              />
              <Button
                label="Cancel"
                size="sm"
                fullWidth
                variant="outline"
                onPress={() => setEditing(null)}
              />
            </Card>
            </View>
          </Pressable>
        </Modal>

        <Modal visible={docPickerOpen} transparent animationType="fade" onRequestClose={() => {
          setDocPickerOpen(false);
          deliverBusinessDoc?.({ canceled: true });
          deliverBusinessDoc = null;
        }}>
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "rgba(15, 44, 92, 0.45)",
              justifyContent: "center",
              padding: 24,
            }}
            onPress={() => {
              setDocPickerOpen(false);
              deliverBusinessDoc?.({ canceled: true });
              deliverBusinessDoc = null;
            }}
          >
            <View
              onStartShouldSetResponder={() => true}
              style={{
                backgroundColor: "#fff",
                borderRadius: 16,
                padding: 16,
                gap: 12,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>
                Business document
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                Images, PDF, Word, or text.
              </Text>
              <View style={{ height: 48 }}>
                <WebView
                  originWhitelist={["*"]}
                  source={{ html: BUSINESS_DOC_HTML }}
                  onMessage={(event) => {
                    let message: BusinessDocMessage = {};
                    try {
                      message = JSON.parse(event.nativeEvent.data) as BusinessDocMessage;
                    } catch {
                      message = { error: "read" };
                    }
                    setDocPickerOpen(false);
                    const finish = deliverBusinessDoc;
                    deliverBusinessDoc = null;
                    finish?.(message);
                  }}
                />
              </View>
              <Button
                label="Cancel"
                size="sm"
                fullWidth
                variant="outline"
                onPress={() => {
                  setDocPickerOpen(false);
                  deliverBusinessDoc?.({ canceled: true });
                  deliverBusinessDoc = null;
                }}
              />
            </View>
          </Pressable>
        </Modal>
    </>
  );

  if (embedded) {
    return <View style={{ flex: 1 }}>{panel}</View>;
  }

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {panel}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}
