import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronDown, ChevronUp, RefreshCw, Wrench } from "lucide-react-native";
import { useRecentServices } from "@/hooks/useRecentServices";
import { formatTopicPath } from "@/lib/servicePaTopics";
import type { Message } from "@/api/messages";
import { colors } from "@/theme/colors";

const COLLAPSED_COUNT = 3;

function serviceTitle(row: Message): string {
  const subject = row.subject?.trim();
  if (subject) return subject;
  const body = row.message?.trim();
  if (body) return body.length > 80 ? `${body.slice(0, 77)}…` : body;
  return "Service request";
}

function serviceMeta(row: Message): string {
  return (
    row.topic_label?.trim() ||
    formatTopicPath(row.topic, row.subtopic) ||
    row.zone_id ||
    "Zone"
  );
}

type Props = {
  zoneId?: string;
};

export function RecentServicesSection({ zoneId }: Props) {
  const router = useRouter();
  const { services, loading, error, refresh, zoneId: resolvedZoneId } =
    useRecentServices(zoneId);
  const [expanded, setExpanded] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(true);

  useEffect(() => {
    setExpanded(false);
  }, [resolvedZoneId]);

  if (!resolvedZoneId) return null;

  const canToggle = services.length > COLLAPSED_COUNT;
  const visibleRows = expanded ? services : services.slice(0, COLLAPSED_COUNT);
  const hiddenCount = services.length - visibleRows.length;

  const openMessages = (messageId?: string) => {
    const query = messageId
      ? `?type=SERVICE&message=${encodeURIComponent(messageId)}`
      : "?type=SERVICE";
    router.push(`/(tabs)/messages${query}` as Href);
  };

  return (
    <View
      style={{
        borderRadius: 16,
        backgroundColor: "rgba(255,255,255,0.95)",
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={() => setSectionOpen((v) => !v)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: "rgba(251,239,216,0.65)",
          borderBottomWidth: sectionOpen ? 1 : 0,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <Wrench size={16} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>
              Recent services
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
              Latest SERVICE broadcasts for your zone
            </Text>
          </View>
        </View>
        {sectionOpen ? (
          <ChevronUp size={16} color={colors.textMuted} />
        ) : (
          <ChevronDown size={16} color={colors.textMuted} />
        )}
      </Pressable>

      {sectionOpen ? (
        <View style={{ padding: 12, gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
            <Pressable
              onPress={() => openMessages()}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: "rgba(251,239,216,0.9)",
                borderWidth: 1,
                borderColor: "rgba(240,219,176,0.9)",
              }}
            >
              <Text style={{ color: colors.warning, fontSize: 11, fontWeight: "700" }}>
                View all
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void refresh()}
              disabled={loading}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: loading ? 0.6 : 1,
              }}
            >
              <RefreshCw size={12} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>
                Refresh
              </Text>
            </Pressable>
          </View>

          {error ? (
            <Text style={{ color: colors.danger, fontSize: 11 }}>{error}</Text>
          ) : null}

          {loading && services.length === 0 ? (
            <ActivityIndicator color={colors.accent} />
          ) : null}

          {!loading && services.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
              No service messages yet. Administrators can publish from Messages → SERVICES.
            </Text>
          ) : null}

          {visibleRows.map((row) => (
            <Pressable
              key={row.id}
              onPress={() => openMessages(row.id)}
              style={{
                padding: 12,
                borderRadius: 12,
                backgroundColor: colors.bgCard,
                borderWidth: 1,
                borderColor: colors.border,
                gap: 4,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 13,
                    fontWeight: "700",
                    flex: 1,
                  }}
                  numberOfLines={2}
                >
                  {serviceTitle(row)}
                </Text>
                <Text
                  style={{
                    color: colors.warning,
                    fontSize: 9,
                    fontWeight: "800",
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    maxWidth: 96,
                    textAlign: "right",
                  }}
                  numberOfLines={2}
                >
                  {serviceMeta(row)}
                </Text>
              </View>
              <Text style={{ color: colors.textDim, fontSize: 10 }}>
                {row.created_at
                  ? new Date(row.created_at).toLocaleString()
                  : "Just now"}
              </Text>
            </Pressable>
          ))}

          {canToggle ? (
            <Pressable
              onPress={() => setExpanded((v) => !v)}
              style={{ alignItems: "center", paddingVertical: 4 }}
            >
              <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "700" }}>
                {expanded ? "Show fewer" : `Show ${hiddenCount} more`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
