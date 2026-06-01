import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Search,
  Send,
  Terminal,
  X,
} from "lucide-react-native";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/context/AuthContext";
import { API_BASE_URL } from "@/api/client";
import { getToken } from "@/lib/storage";
import { copyToClipboard } from "@/lib/copyToClipboard";
import {
  API_ENDPOINTS,
  DEFAULT_JSON_BODY,
  buildCurlCommand,
  buildEndpointBody,
  buildEndpointUrl,
  type EndpointSpec,
  type HttpMethod,
} from "@/lib/apiDocsEndpoints";
import { colors } from "@/theme/colors";

type CopyKind = "curl" | "url";

function methodPalette(method: HttpMethod): {
  bg: string;
  fg: string;
  border: string;
} {
  switch (method) {
    case "GET":
      return { bg: "#0F2A1F", fg: colors.success, border: "#1F4A36" };
    case "POST":
      return { bg: "#0F1F33", fg: "#5FB3FF", border: "#1E3A66" };
    case "PUT":
    case "PATCH":
      return { bg: "#33240E", fg: colors.warning, border: "#5C401C" };
    case "DELETE":
      return { bg: "#3A0E1C", fg: colors.danger, border: "#5C1B2C" };
    default:
      return {
        bg: colors.bgSurface,
        fg: colors.textMuted,
        border: colors.border,
      };
  }
}

function MethodPill({
  method,
  small,
}: {
  method: HttpMethod;
  small?: boolean;
}) {
  const palette = methodPalette(method);
  return (
    <View
      style={{
        paddingHorizontal: small ? 7 : 9,
        paddingVertical: small ? 2 : 3,
        borderRadius: 6,
        backgroundColor: palette.bg,
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      <Text
        style={{
          color: palette.fg,
          fontSize: small ? 9 : 10,
          fontWeight: "800",
          letterSpacing: 0.6,
        }}
      >
        {method}
      </Text>
    </View>
  );
}

function GroupPill({ group }: { group: EndpointSpec["group"] }) {
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 5,
        backgroundColor: colors.bgSurface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 9,
          fontWeight: "700",
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        {group}
      </Text>
    </View>
  );
}

const monoFamily = Platform.OS === "ios" ? "Menlo" : "monospace";

export default function ApiDocsScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [selectedId, setSelectedId] = useState(API_ENDPOINTS[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [curlDraft, setCurlDraft] = useState("");
  const curlEditedRef = useRef(false);
  const prevEndpointRef = useRef(selectedId);
  const [copied, setCopied] = useState<CopyKind | null>(null);
  const [loading, setLoading] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => API_ENDPOINTS.find((e) => e.id === selectedId) ?? API_ENDPOINTS[0],
    [selectedId],
  );

  const filteredEndpoints = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return API_ENDPOINTS;
    return API_ENDPOINTS.filter((ep) =>
      `${ep.method} ${ep.path} ${ep.description} ${ep.group}`
        .toLowerCase()
        .includes(q),
    );
  }, [search]);

  useEffect(() => {
    if (!selected) return;
    setValues((prev) => {
      const next = { ...prev };
      if (selected.bodyJson) {
        next.body = next.body ?? DEFAULT_JSON_BODY[selected.id] ?? "{}";
      }
      for (const p of selected.params) {
        if (
          p.in === "body" &&
          p.name !== "body" &&
          next[p.name] === undefined
        ) {
          next[p.name] = "";
        }
      }
      return next;
    });
    setResponseText("");
    setResponseStatus(null);
    setError(null);
  }, [selected?.id]);

  const generatedCurl = useMemo(() => {
    if (!selected) return "";
    return buildCurlCommand(API_BASE_URL, selected, values, Boolean(token));
  }, [selected, values, token]);

  useEffect(() => {
    const endpointChanged = prevEndpointRef.current !== selectedId;
    prevEndpointRef.current = selectedId;
    if (endpointChanged) {
      curlEditedRef.current = false;
      setCurlDraft(generatedCurl);
      return;
    }
    if (!curlEditedRef.current) {
      setCurlDraft(generatedCurl);
    }
  }, [selectedId, generatedCurl]);

  const flashCopied = useCallback((kind: CopyKind) => {
    setCopied(kind);
    setTimeout(() => setCopied((cur) => (cur === kind ? null : cur)), 1500);
  }, []);

  const onCopy = useCallback(
    async (kind: CopyKind, text: string) => {
      const result = await copyToClipboard(text);
      if (result.ok && result.method === "clipboard") {
        flashCopied(kind);
      }
    },
    [flashCopied],
  );

  const setField = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const sendLive = async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    setResponseText("");
    setResponseStatus(null);
    try {
      const url = buildEndpointUrl(API_BASE_URL, selected, values);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (!selected.public) {
        const liveToken = token ?? (await getToken());
        if (liveToken) {
          headers.Authorization = `Bearer ${liveToken}`;
        }
      }
      let body: string | undefined;
      if (selected.method !== "GET") {
        if (selected.bodyJson) {
          const raw = values.body?.trim();
          if (!raw) {
            throw new Error("Body JSON is required for this request.");
          }
          try {
            body = JSON.stringify(JSON.parse(raw));
          } catch {
            throw new Error("Invalid JSON in body.");
          }
        } else {
          const obj = buildEndpointBody(selected, values);
          if (obj) body = JSON.stringify(obj);
        }
      }
      const res = await fetch(url, { method: selected.method, headers, body });
      setResponseStatus(res.status);
      const text = await res.text();
      let formatted = text;
      try {
        formatted = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* keep raw text */
      }
      setResponseText(formatted);
      if (!res.ok) {
        setError(`HTTP ${res.status} ${res.statusText || ""}`.trim());
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setResponseText(msg);
    } finally {
      setLoading(false);
    }
  };

  const baseHost = API_BASE_URL.replace(/^https?:\/\//, "");

  const pathQueryParams =
    selected?.params.filter((p) => p.in === "path" || p.in === "query") ?? [];
  const bodyInputs =
    selected?.params.filter((p) => p.in === "body" && p.name !== "body") ?? [];
  const hasAnyParam =
    pathQueryParams.length > 0 ||
    (selected?.bodyJson ?? false) ||
    bodyInputs.length > 0;

  const previewUrl = selected
    ? buildEndpointUrl(API_BASE_URL, selected, values)
    : "";

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader
          title="API docs"
          subtitle={baseHost}
          showBack
          onBack={() => router.replace("/(tabs)/settings")}
        />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 32,
              gap: 14,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Session banner */}
            <Card style={{ padding: 14 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Terminal size={16} color={colors.accent} />
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  {token ? "Authenticated session" : "Not signed in"}
                </Text>
              </View>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  marginTop: 6,
                  lineHeight: 17,
                }}
              >
                {token
                  ? `Live requests send your bearer token automatically${user?.email ? ` as ${user.email}` : ""}.`
                  : "Public endpoints can still be tested. Sign in to call authenticated routes."}
              </Text>
            </Card>

            {/* Endpoint picker */}
            <Card padded={false}>
              <Pressable
                onPress={() => setPickerOpen((v) => !v)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  padding: 14,
                }}
              >
                <View style={{ flex: 1, gap: 6 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {selected ? <MethodPill method={selected.method} /> : null}
                    {selected ? <GroupPill group={selected.group} /> : null}
                  </View>
                  <Text
                    selectable
                    style={{
                      color: colors.text,
                      fontFamily: monoFamily,
                      fontSize: 13,
                    }}
                  >
                    {selected?.path ?? "—"}
                  </Text>
                </View>
                {pickerOpen ? (
                  <ChevronUp size={18} color={colors.textMuted} />
                ) : (
                  <ChevronDown size={18} color={colors.textMuted} />
                )}
              </Pressable>
              {pickerOpen ? (
                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <Search size={16} color={colors.textDim} />
                    <TextInput
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Search endpoints"
                      placeholderTextColor={colors.textDim}
                      autoCapitalize="none"
                      style={{
                        flex: 1,
                        color: colors.text,
                        fontSize: 13,
                        paddingVertical: 6,
                      }}
                    />
                    {search ? (
                      <Pressable onPress={() => setSearch("")} hitSlop={10}>
                        <X size={16} color={colors.textDim} />
                      </Pressable>
                    ) : null}
                  </View>
                  <ScrollView
                    style={{ maxHeight: 280 }}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                  >
                    {filteredEndpoints.length === 0 ? (
                      <Text
                        style={{
                          color: colors.textMuted,
                          fontSize: 12,
                          padding: 16,
                          textAlign: "center",
                        }}
                      >
                        No endpoints match “{search}”.
                      </Text>
                    ) : (
                      filteredEndpoints.map((ep) => {
                        const active = ep.id === selectedId;
                        return (
                          <Pressable
                            key={ep.id}
                            onPress={() => {
                              setSelectedId(ep.id);
                              setPickerOpen(false);
                              setSearch("");
                            }}
                            style={{
                              paddingHorizontal: 14,
                              paddingVertical: 10,
                              borderBottomWidth: 1,
                              borderBottomColor: colors.border,
                              backgroundColor: active
                                ? "rgba(255,45,170,0.08)"
                                : "transparent",
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <MethodPill method={ep.method} small />
                              <GroupPill group={ep.group} />
                              <Text
                                style={{
                                  color: active ? colors.accent : colors.text,
                                  fontFamily: monoFamily,
                                  fontSize: 12,
                                  flexShrink: 1,
                                }}
                                numberOfLines={1}
                              >
                                {ep.path}
                              </Text>
                            </View>
                            <Text
                              style={{
                                color: colors.textMuted,
                                fontSize: 11,
                                marginTop: 4,
                              }}
                              numberOfLines={2}
                            >
                              {ep.description}
                            </Text>
                          </Pressable>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              ) : null}
            </Card>

            {/* Selected endpoint details */}
            {selected ? (
              <Card>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <MethodPill method={selected.method} />
                  <Text
                    selectable
                    style={{
                      color: colors.text,
                      fontFamily: monoFamily,
                      fontSize: 14,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {selected.path}
                  </Text>
                </View>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 13,
                    marginTop: 10,
                    lineHeight: 19,
                  }}
                >
                  {selected.description}
                </Text>
                <View
                  style={{
                    marginTop: 12,
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    gap: 4,
                  }}
                >
                  <Text
                    selectable
                    style={{
                      color: colors.textDim,
                      fontSize: 11,
                      fontFamily: monoFamily,
                    }}
                  >
                    {previewUrl}
                  </Text>
                  <Pressable
                    onPress={() => void onCopy("url", previewUrl)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 8,
                      alignSelf: "flex-start",
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.bgSurface,
                    }}
                  >
                    {copied === "url" ? (
                      <Check size={12} color={colors.success} />
                    ) : (
                      <Copy size={12} color={colors.textMuted} />
                    )}
                    <Text
                      style={{
                        color:
                          copied === "url" ? colors.success : colors.textMuted,
                        fontSize: 11,
                        fontWeight: "700",
                        letterSpacing: 0.4,
                      }}
                    >
                      {copied === "url" ? "URL COPIED" : "COPY URL"}
                    </Text>
                  </Pressable>
                </View>
              </Card>
            ) : null}

            {/* Parameters */}
            <Card>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 10,
                  fontWeight: "700",
                  letterSpacing: 1.6,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Parameters
              </Text>
              {!hasAnyParam ? (
                <Text
                  style={{
                    color: colors.textDim,
                    fontSize: 13,
                    marginTop: 6,
                  }}
                >
                  No parameters.
                </Text>
              ) : (
                <View style={{ marginTop: 12, gap: 14 }}>
                  {pathQueryParams.map((p) => (
                    <View key={`${p.in}-${p.name}`}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <Text
                          style={{
                            color: colors.text,
                            fontSize: 13,
                            fontWeight: "700",
                          }}
                        >
                          {p.name}
                          {p.required ? (
                            <Text style={{ color: colors.danger }}> *</Text>
                          ) : null}
                        </Text>
                        <Text
                          style={{
                            color: colors.textDim,
                            fontSize: 10,
                            fontWeight: "700",
                            letterSpacing: 1,
                            textTransform: "uppercase",
                          }}
                        >
                          {p.in} · {p.type ?? "string"}
                        </Text>
                      </View>
                      <TextInput
                        value={values[p.name] ?? ""}
                        onChangeText={(v) => setField(p.name, v)}
                        placeholder={p.placeholder ?? p.name}
                        placeholderTextColor={colors.textDim}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType={
                          p.type === "number" ? "numeric" : "default"
                        }
                        style={{
                          color: colors.text,
                          fontSize: 13,
                          fontFamily: monoFamily,
                          backgroundColor: colors.bgSurface,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: colors.border,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                        }}
                      />
                    </View>
                  ))}
                  {selected?.bodyJson ? (
                    <View>
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: 13,
                          fontWeight: "700",
                          marginBottom: 6,
                        }}
                      >
                        body{" "}
                        <Text style={{ color: colors.textDim, fontSize: 11 }}>
                          (JSON)
                        </Text>
                      </Text>
                      <TextInput
                        value={values.body ?? ""}
                        onChangeText={(v) => setField("body", v)}
                        multiline
                        autoCapitalize="none"
                        autoCorrect={false}
                        spellCheck={false}
                        style={{
                          color: colors.text,
                          fontSize: 12,
                          fontFamily: monoFamily,
                          backgroundColor: colors.bgSurface,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: colors.border,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          minHeight: 180,
                          textAlignVertical: "top",
                        }}
                      />
                    </View>
                  ) : (
                    bodyInputs.map((p) => (
                      <View key={`${p.in}-${p.name}`}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 6,
                          }}
                        >
                          <Text
                            style={{
                              color: colors.text,
                              fontSize: 13,
                              fontWeight: "700",
                            }}
                          >
                            {p.name}
                            {p.required ? (
                              <Text style={{ color: colors.danger }}> *</Text>
                            ) : null}
                          </Text>
                          <Text
                            style={{
                              color: colors.textDim,
                              fontSize: 10,
                              fontWeight: "700",
                              letterSpacing: 1,
                              textTransform: "uppercase",
                            }}
                          >
                            body · {p.type ?? "string"}
                          </Text>
                        </View>
                        <TextInput
                          value={values[p.name] ?? ""}
                          onChangeText={(v) => setField(p.name, v)}
                          placeholder={p.placeholder ?? p.name}
                          placeholderTextColor={colors.textDim}
                          autoCapitalize="none"
                          autoCorrect={false}
                          secureTextEntry={p.name
                            .toLowerCase()
                            .includes("password")}
                          keyboardType={
                            p.type === "number" ? "numeric" : "default"
                          }
                          style={{
                            color: colors.text,
                            fontSize: 13,
                            fontFamily: monoFamily,
                            backgroundColor: colors.bgSurface,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: colors.border,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                          }}
                        />
                      </View>
                    ))
                  )}
                </View>
              )}
            </Card>

            {/* Curl preview */}
            <Card>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 10,
                    fontWeight: "700",
                    letterSpacing: 1.6,
                    textTransform: "uppercase",
                  }}
                >
                  curl
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={() => {
                      curlEditedRef.current = false;
                      setCurlDraft(generatedCurl);
                    }}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
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
                      RESET
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void onCopy("curl", curlDraft)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.bgSurface,
                    }}
                  >
                    {copied === "curl" ? (
                      <Check size={12} color={colors.success} />
                    ) : (
                      <Copy size={12} color={colors.textMuted} />
                    )}
                    <Text
                      style={{
                        color:
                          copied === "curl" ? colors.success : colors.textMuted,
                        fontSize: 11,
                        fontWeight: "700",
                        letterSpacing: 0.4,
                      }}
                    >
                      {copied === "curl" ? "COPIED" : "COPY"}
                    </Text>
                  </Pressable>
                </View>
              </View>
              <TextInput
                value={curlDraft}
                onChangeText={(v) => {
                  curlEditedRef.current = true;
                  setCurlDraft(v);
                }}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                style={{
                  color: colors.text,
                  fontSize: 12,
                  fontFamily: monoFamily,
                  backgroundColor: colors.bg,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  minHeight: 140,
                  textAlignVertical: "top",
                }}
              />
              <Text
                style={{
                  color: colors.textDim,
                  fontSize: 11,
                  marginTop: 8,
                }}
              >
                Edit freely for your terminal — Send below still uses the
                parameters above.
              </Text>
            </Card>

            {/* Live test */}
            <Card>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 10,
                  fontWeight: "700",
                  letterSpacing: 1.6,
                  textTransform: "uppercase",
                  marginBottom: 12,
                }}
              >
                Live test
              </Text>
              <Pressable
                onPress={() => void sendLive()}
                disabled={loading}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: colors.accent,
                  opacity: loading ? 0.6 : pressed ? 0.9 : 1,
                })}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    gap: 8,
                  }}
                >
                  <Send size={14} color="#fff" />
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: "800",
                      letterSpacing: 0.4,
                    }}
                  >
                    {loading ? "SENDING…" : "SEND REQUEST"}
                  </Text>
                </View>
              </Pressable>
              {error ? (
                <Text
                  style={{
                    color: colors.danger,
                    fontSize: 12,
                    marginTop: 10,
                  }}
                >
                  {error}
                </Text>
              ) : null}
              <View
                style={{
                  marginTop: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.bg,
                  padding: 12,
                  minHeight: 120,
                }}
              >
                {responseStatus != null ? (
                  <Text
                    style={{
                      color:
                        responseStatus >= 200 && responseStatus < 300
                          ? colors.success
                          : colors.warning,
                      fontSize: 11,
                      fontWeight: "800",
                      letterSpacing: 0.6,
                      marginBottom: 8,
                    }}
                  >
                    HTTP {responseStatus}
                  </Text>
                ) : null}
                <Text
                  selectable
                  style={{
                    color: responseText ? colors.text : colors.textDim,
                    fontSize: 12,
                    fontFamily: monoFamily,
                    lineHeight: 17,
                  }}
                >
                  {responseText ||
                    "Response will appear here after you send a request."}
                </Text>
              </View>
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}
