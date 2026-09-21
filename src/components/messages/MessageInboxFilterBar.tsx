import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Search } from "lucide-react-native";
import { DateRangeFilterChip } from "@/components/messages/DateRangeFilterChip";
import { FilterSelectChip } from "@/components/messages/FilterSelectChip";
import type { MessageType } from "@/lib/messageTypes";
import type { ZoneNameLookup } from "@/lib/messageZoneLabel";
import { colors, radius } from "@/theme/colors";

export type MessageInboxFilterBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  zoneFilter: string;
  onZoneFilterChange: (value: string) => void;
  zoneIds: string[];
  zoneNames?: ZoneNameLookup;
  typeFilter: "all" | MessageType;
  onTypeFilterChange: (value: "all" | MessageType) => void;
  typeOptions: Array<{ type: MessageType; label: string }>;
  typeAllLabel?: string;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  searchPlaceholder?: string;
};

/**
 * Marketplace-style inbox filters: pill search with icon, then one chip row
 * for zone / type / date (chevron dropdowns).
 */
export function MessageInboxFilterBar({
  search,
  onSearchChange,
  zoneFilter,
  onZoneFilterChange,
  zoneIds,
  zoneNames,
  typeFilter,
  onTypeFilterChange,
  typeOptions,
  typeAllLabel = "All types",
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  searchPlaceholder = "Search messages…",
}: MessageInboxFilterBarProps) {
  const hasActiveFilters =
    search.trim().length > 0 ||
    zoneFilter !== "all" ||
    typeFilter !== "all" ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  const zoneOptions = [
    { value: "all", label: "All zones" },
    ...zoneIds.map((zone) => ({
      value: zone,
      label: zoneNames?.get(zone) ?? zone,
    })),
  ];

  const typeSelectOptions = [
    { value: "all", label: typeAllLabel },
    ...typeOptions.map((option) => ({
      value: option.type,
      label: option.label,
    })),
  ];

  const clearFilters = () => {
    onSearchChange("");
    onZoneFilterChange("all");
    onTypeFilterChange("all");
    onDateFromChange("");
    onDateToChange("");
  };

  return (
    <View style={{ marginBottom: 14, gap: 12 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: "#FFFFFF",
          borderRadius: radius.pill,
          paddingHorizontal: 14,
          paddingVertical: 4,
          minHeight: 48,
        }}
      >
        <Search size={18} color={colors.textDim} />
        <TextInput
          value={search}
          onChangeText={onSearchChange}
          placeholder={searchPlaceholder}
          placeholderTextColor={colors.textDim}
          style={{
            flex: 1,
            paddingHorizontal: 10,
            paddingVertical: 11,
            color: colors.text,
            fontSize: 15,
          }}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: 8,
          paddingRight: 4,
          alignItems: "center",
        }}
      >
        <FilterSelectChip
          label="Zone"
          value={zoneFilter}
          options={zoneOptions}
          onChange={onZoneFilterChange}
          emphasized={zoneFilter !== "all"}
        />
        {typeOptions.length > 0 ? (
          <FilterSelectChip
            label="Type"
            value={typeFilter}
            options={typeSelectOptions}
            onChange={(next) =>
              onTypeFilterChange(next === "all" ? "all" : (next as MessageType))
            }
            emphasized={typeFilter !== "all"}
          />
        ) : null}
        <DateRangeFilterChip
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={onDateFromChange}
          onDateToChange={onDateToChange}
        />
      </ScrollView>

      {hasActiveFilters ? (
        <Pressable onPress={clearFilters} hitSlop={8}>
          <Text
            style={{
              color: colors.accent,
              fontSize: 13,
              fontWeight: "600",
              textAlign: "center",
            }}
          >
            Clear filters
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
