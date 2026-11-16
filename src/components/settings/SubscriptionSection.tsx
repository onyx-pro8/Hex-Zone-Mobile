import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { BottomSheetScrollView } from "@/components/ui/BottomSheetScrollView";
import { Card } from "@/components/ui/Card";
import {
  createBillingPortalSession,
  createSubscriptionCheckout,
  getSubscriptionOverview,
  type SubscriptionFeatureMeter,
  type SubscriptionOverview,
  type SubscriptionPlan,
} from "@/api/subscription";
import { toast } from "@/lib/toast";
import { colors } from "@/theme/colors";

function formatMoney(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "Custom";
  if (amount === 0) return "Free";
  const fixed = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
  return `$${Number(fixed).toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function planDisplayPrice(
  plan: SubscriptionPlan,
  interval: "monthly" | "annual",
): { primary: string; secondary: string } {
  if (plan.price_monthly == null || plan.price_annual == null) {
    return { primary: "Custom", secondary: "Contact sales" };
  }
  if (plan.price_monthly === 0) {
    return { primary: "Free", secondary: "No billing" };
  }
  if (interval === "monthly") {
    return {
      primary: `${formatMoney(plan.price_monthly)}/mo`,
      secondary: `${formatMoney(plan.price_annual)} / year if billed annually`,
    };
  }
  const perMonth = plan.price_annual / 12;
  return {
    primary: `${formatMoney(perMonth)}/mo`,
    secondary: `${formatMoney(plan.price_annual)} billed annually`,
  };
}

function formatLimit(value: number | null | undefined, unit?: string): string {
  if (value == null) return "Unlimited";
  const n = Number(value);
  if (!Number.isFinite(n)) return "Unlimited";
  const formatted =
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
      : n >= 1_000
        ? `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`
        : String(n);
  if (unit === "minutes") return `${formatted} min`;
  if (unit === "days") return `${formatted} days`;
  return formatted;
}

function formatUsed(feature: SubscriptionFeatureMeter): string {
  if (feature.key === "history_retention_days") {
    return formatLimit(feature.limit, "days");
  }
  const used =
    feature.unit === "minutes"
      ? `${Number(feature.used).toFixed(feature.used % 1 === 0 ? 0 : 1)}`
      : String(feature.used);
  const limit = formatLimit(
    feature.limit,
    feature.unit === "minutes" ? undefined : feature.unit,
  );
  if (feature.unit === "minutes") {
    return feature.unlimited ? `${used} min / ∞` : `${used} / ${limit} min`;
  }
  return feature.unlimited ? `${used} / ∞` : `${used} / ${limit}`;
}

function MeterRow({ feature }: { feature: SubscriptionFeatureMeter }) {
  const pct = feature.unlimited
    ? 0
    : Math.max(0, Math.min(100, Number(feature.percent_used) || 0));
  const over = !feature.unlimited && pct >= 95;
  return (
    <View style={{ gap: 6 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 13,
            fontWeight: "600",
            flex: 1,
          }}
        >
          {feature.label}
        </Text>
        <Text
          style={{
            color: over ? colors.danger : colors.textMuted,
            fontSize: 12,
            fontWeight: "600",
          }}
        >
          {formatUsed(feature)}
        </Text>
      </View>
      {!feature.unlimited && feature.key !== "history_retention_days" ? (
        <View
          style={{
            height: 6,
            borderRadius: 999,
            backgroundColor: colors.bgMuted,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${pct}%`,
              height: "100%",
              backgroundColor: over ? colors.danger : colors.accent,
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function PlanFeatureLines({ plan }: { plan: SubscriptionPlan }) {
  const lines = [
    `Members: ${formatLimit(plan.members)}`,
    `Smart-home hubs: ${formatLimit(plan.smart_home_hubs)}`,
    `Messages / mo: ${formatLimit(plan.messages_per_month)}`,
    `History: ${formatLimit(plan.history_retention_days, "days")}`,
    `Universal Access keys: ${formatLimit(plan.ua_keys)}`,
    `Access QR / mo: ${formatLimit(plan.access_qr_per_month)}`,
    `Guest call minutes / mo: ${formatLimit(plan.guest_call_minutes_per_month, "minutes")}`,
    `API calls / mo: ${formatLimit(plan.api_calls_per_month)}`,
  ];
  return (
    <View style={{ gap: 4, marginTop: 8 }}>
      {lines.map((line) => (
        <Text key={line} style={{ color: colors.textMuted, fontSize: 11, lineHeight: 15 }}>
          • {line}
        </Text>
      ))}
      {plan.allowed_message_types?.length ? (
        <Text style={{ color: colors.textDim, fontSize: 10, marginTop: 2 }}>
          Message types: {plan.allowed_message_types.join(", ")}
        </Text>
      ) : null}
    </View>
  );
}

function PlanPickRow({
  plan,
  selected,
  isCurrent,
  interval,
  onPress,
}: {
  plan: SubscriptionPlan;
  selected: boolean;
  isCurrent: boolean;
  interval: "monthly" | "annual";
  onPress: () => void;
}) {
  const price = planDisplayPrice(plan, interval);
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? "rgba(47,128,237,0.08)" : colors.bgSurface,
        borderRadius: 14,
        padding: 12,
        gap: 2,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>
            {plan.label}
          </Text>
          {isCurrent ? (
            <Text
              style={{
                alignSelf: "flex-start",
                color: colors.accent,
                fontSize: 10,
                fontWeight: "800",
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              Current plan
            </Text>
          ) : null}
        </View>
        <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 13 }}>
          {price.primary}
        </Text>
      </View>
      <Text style={{ color: colors.textDim, fontSize: 11 }}>{price.secondary}</Text>
      {selected ? <PlanFeatureLines plan={plan} /> : (
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
          {plan.members == null ? "Unlimited" : plan.members} members ·{" "}
          {plan.smart_home_hubs == null ? "∞" : plan.smart_home_hubs} hubs ·{" "}
          {formatLimit(plan.guest_call_minutes_per_month, "minutes")} guest calls
        </Text>
      )}
    </Pressable>
  );
}

export function SubscriptionSection() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">(
    "monthly",
  );
  const [selectedPlanKey, setSelectedPlanKey] = useState<string>("enhanced");

  const closePicker = useCallback(() => {
    setPickerOpen(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getSubscriptionOverview();
    if (res.error) {
      toast.error(res.error);
      setOverview(null);
      setLoading(false);
      return;
    }
    setOverview(res.data);
    if (res.data?.plan?.plan_key) {
      const current = res.data.plan.plan_key;
      const next =
        current === "exclusive"
          ? "enhanced"
          : res.data.upgrade_plans.find(
              (p) => p.plan_key !== "exclusive" && p.plan_key !== current,
            )?.plan_key || "enhanced";
      setSelectedPlanKey(next);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Tabs keep this screen mounted — always dismiss the picker when leaving
  // so it cannot sit above the global compose BottomSheet.
  useFocusEffect(
    useCallback(() => {
      return () => {
        setPickerOpen(false);
      };
    }, []),
  );

  const paidPlans = useMemo(
    () =>
      (overview?.upgrade_plans || []).filter(
        (p) =>
          p.plan_key !== "exclusive" &&
          p.price_monthly != null &&
          p.price_monthly > 0,
      ),
    [overview],
  );

  const selectedPlan = useMemo(
    () => paidPlans.find((p) => p.plan_key === selectedPlanKey) || paidPlans[0] || null,
    [paidPlans, selectedPlanKey],
  );

  const currentPlanKey = overview?.plan?.plan_key || "";
  const selectedIsCurrent =
    !!selectedPlan && selectedPlan.plan_key === currentPlanKey;

  const openUrl = async (url: string) => {
    const can = await Linking.canOpenURL(url);
    if (!can) {
      toast.error("Unable to open billing page on this device.");
      return;
    }
    await Linking.openURL(url);
  };

  const onCheckout = async () => {
    if (!overview?.can_manage_billing) {
      toast.error("Only the network administrator can change the plan.");
      return;
    }
    if (!overview.stripe_configured) {
      toast.error(
        "Stripe is not configured on the server yet. Set STRIPE_SECRET_KEY and price IDs.",
      );
      return;
    }
    const planKey = selectedPlan?.plan_key || selectedPlanKey;
    setBusy(true);
    const res = await createSubscriptionCheckout({
      plan_key: planKey,
      billing_interval: billingInterval,
    });
    setBusy(false);
    if (res.error || !res.data?.checkout_url) {
      toast.error(res.error || "Could not start checkout.");
      return;
    }
    closePicker();
    await openUrl(res.data.checkout_url);
  };

  const onPortal = async () => {
    if (!overview?.can_manage_billing) {
      toast.error("Only the network administrator can manage billing.");
      return;
    }
    if (!overview.stripe_configured) {
      toast.error("Stripe is not configured on the server yet.");
      return;
    }
    setBusy(true);
    const res = await createBillingPortalSession();
    setBusy(false);
    if (res.error || !res.data?.portal_url) {
      toast.error(res.error || "Could not open billing portal.");
      return;
    }
    await openUrl(res.data.portal_url);
  };

  if (loading) {
    return (
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            Loading subscription…
          </Text>
        </View>
      </Card>
    );
  }

  if (!overview) {
    return (
      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          Subscription details are unavailable right now.
        </Text>
        <Button label="Retry" variant="secondary" onPress={() => void load()} />
      </Card>
    );
  }

  return (
    <>
      <Card style={{ gap: 14 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>
            {overview.plan.label}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            Status: {overview.subscription.status}
            {overview.subscription.billing_interval
              ? ` · ${overview.subscription.billing_interval}`
              : ""}
            {overview.year_month ? ` · ${overview.year_month}` : ""}
          </Text>
          {!overview.can_manage_billing ? (
            <Text style={{ color: colors.textDim, fontSize: 12, marginTop: 4 }}>
              Plan is managed by the network administrator. Limits below are
              shared across the whole network.
            </Text>
          ) : null}
        </View>

        <Text style={{ color: colors.textDim, fontSize: 11, lineHeight: 16 }}>
          {overview.scope_note}
        </Text>

        <View style={{ gap: 12 }}>
          {overview.features.map((feature) => (
            <MeterRow key={feature.key} feature={feature} />
          ))}
        </View>

        {overview.can_manage_billing ? (
          <View style={{ gap: 10, marginTop: 4 }}>
            <Button
              label="Upgrade / change plan"
              onPress={() => setPickerOpen(true)}
              disabled={busy}
              fullWidth
            />
            <Button
              label="Manage billing"
              variant="secondary"
              onPress={() => void onPortal()}
              disabled={busy}
              fullWidth
            />
            <Button
              label="Refresh usage"
              variant="ghost"
              onPress={() => void load()}
              disabled={busy}
              fullWidth
            />
            {!overview.stripe_configured ? (
              <Text style={{ color: colors.warning, fontSize: 11 }}>
                Stripe keys are not set on the API yet. Usage meters still work;
                Checkout opens after STRIPE_SECRET_KEY and price IDs are
                configured.
              </Text>
            ) : null}
          </View>
        ) : null}
      </Card>

      <BottomSheet visible={pickerOpen} onClose={closePicker} maxHeight="88%">
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 28,
            gap: 12,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>
            Choose a plan
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            Tap a plan to see full feature limits. Switch Monthly / Annual to
            update pricing. Tap outside to close.
          </Text>

          <View
            style={{
              flexDirection: "row",
              backgroundColor: colors.bgSurface,
              borderRadius: 999,
              padding: 4,
              gap: 4,
            }}
          >
            {(["monthly", "annual"] as const).map((interval) => (
              <Pressable
                key={interval}
                onPress={() => setBillingInterval(interval)}
                style={{
                  flex: 1,
                  borderRadius: 999,
                  paddingVertical: 8,
                  alignItems: "center",
                  backgroundColor:
                    billingInterval === interval ? colors.accent : "transparent",
                }}
              >
                <Text
                  style={{
                    color:
                      billingInterval === interval ? "#fff" : colors.textMuted,
                    fontWeight: "700",
                    fontSize: 13,
                    textTransform: "capitalize",
                  }}
                >
                  {interval}
                  {interval === "annual" ? " (save ~16%)" : ""}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ gap: 8 }}>
            {paidPlans.map((plan) => (
              <PlanPickRow
                key={plan.plan_key}
                plan={plan}
                selected={selectedPlanKey === plan.plan_key}
                isCurrent={plan.plan_key === currentPlanKey}
                interval={billingInterval}
                onPress={() => setSelectedPlanKey(plan.plan_key)}
              />
            ))}
          </View>

          {selectedPlan ? (
            <View
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.bgCard,
                padding: 12,
                gap: 4,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>
                {selectedIsCurrent ? "Current plan" : "Selected"}: {selectedPlan.label}
              </Text>
              <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 14 }}>
                {planDisplayPrice(selectedPlan, billingInterval).primary}
              </Text>
              <Text style={{ color: colors.textDim, fontSize: 11 }}>
                {planDisplayPrice(selectedPlan, billingInterval).secondary}
              </Text>
            </View>
          ) : null}

          <Button
            label={
              busy
                ? "Starting Checkout…"
                : selectedIsCurrent
                  ? "Current plan"
                  : "Continue to Stripe"
            }
            onPress={() => void onCheckout()}
            disabled={busy || !selectedPlan || selectedIsCurrent}
            fullWidth
          />
          <Button
            label="Close"
            variant="ghost"
            onPress={closePicker}
            disabled={busy}
            fullWidth
          />
        </BottomSheetScrollView>
      </BottomSheet>
    </>
  );
}
