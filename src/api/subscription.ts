import { request } from "./client";

export type SubscriptionFeatureMeter = {
  key: string;
  label: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  percent_used: number;
  unlimited: boolean;
  unit: string;
};

export type SubscriptionPlan = {
  plan_key: string;
  account_type: string;
  tier_level: number | null;
  label: string;
  price_monthly: number | null;
  price_annual: number | null;
  members: number | null;
  smart_home_hubs: number | null;
  messages_per_month: number | null;
  history_retention_days: number | null;
  ua_keys: number | null;
  ua_uses_per_key_per_month: number | null;
  access_qr_per_month: number | null;
  guest_call_minutes_per_month: number | null;
  api_calls_per_month: number | null;
  location_updates_per_month: number | null;
  allowed_message_types: string[];
};

export type SubscriptionOverview = {
  network_owner_id: number;
  viewer_owner_id: number;
  viewer_is_network_admin: boolean;
  viewer_is_member: boolean;
  plan: SubscriptionPlan;
  subscription: {
    plan_key: string;
    status: string;
    billing_interval: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  };
  stripe_configured: boolean;
  year_month: string;
  features: SubscriptionFeatureMeter[];
  can_manage_billing: boolean;
  upgrade_plans: SubscriptionPlan[];
  scope_note: string;
};

export async function getSubscriptionOverview() {
  return request<SubscriptionOverview>({
    method: "GET",
    url: "/subscription/me",
  });
}

export async function createSubscriptionCheckout(payload: {
  plan_key: string;
  billing_interval?: "monthly" | "annual";
}) {
  return request<{
    checkout_url: string;
    session_id: string;
    plan_key: string;
    billing_interval: string;
  }>({
    method: "POST",
    url: "/subscription/checkout",
    data: payload,
  });
}

export async function createBillingPortalSession() {
  return request<{ portal_url: string }>({
    method: "POST",
    url: "/subscription/portal",
  });
}

export type ConfirmCheckoutResult = {
  ok: boolean;
  status: string;
  payment_status?: string;
  message: string;
  plan: SubscriptionPlan;
  account_type: string;
  role: string;
  tier_level: number | null;
};

export async function confirmSubscriptionCheckout(sessionId: string) {
  return request<ConfirmCheckoutResult>({
    method: "POST",
    url: "/subscription/confirm",
    data: { session_id: sessionId },
  });
}
