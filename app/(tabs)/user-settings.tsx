import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AddressAutocompleteInput } from "@/components/ui/AddressAutocompleteInput";
import { ProfileAvatarButton } from "@/components/ui/ProfileAvatarButton";
import { AvatarUploadModal } from "@/components/settings/AvatarUploadModal";
import { useAuth } from "@/context/AuthContext";
import {
  getRemoteAppSettings,
  updateRemoteAppSettings,
  updateOwnerProfile,
  uploadProfileAvatar,
} from "@/api";
import {
  updateAppSettings,
  useAppSettings,
  type AppSettings,
} from "@/lib/appSettings";
import { toast } from "@/lib/toast";
import {
  ADMIN_ASSIGNABLE_ACCOUNT_TYPES,
  accountTypeLabel,
  canEditOwnAccountType,
  isSystemAdministrator,
  normalizeAccountType,
  toApiAccountType,
  type NormalizedAccountType,
} from "@/lib/accountLimits";
import {
  absolutizeAvatarUrl,
  invalidateAvatarDisplayCache,
  primeAvatarDisplayCache,
} from "@/lib/resolveAvatarUri";
import { colors } from "@/theme/colors";

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "words" | "sentences";
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={{
          backgroundColor: colors.bgSurface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: colors.text,
          fontSize: 15,
        }}
      />
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text
      style={{
        color: colors.textMuted,
        fontSize: 11,
        letterSpacing: 1.4,
        textTransform: "uppercase",
        fontWeight: "700",
        marginTop: 18,
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}

function TypeChip({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        minWidth: "47%",
        flexGrow: 1,
        paddingVertical: 11,
        paddingHorizontal: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.border,
        backgroundColor: active ? colors.accent : colors.bgSurface,
        alignItems: "center",
        opacity: disabled && !active ? 0.55 : 1,
      }}
    >
      <Text
        style={{
          color: active ? "#fff" : colors.text,
          fontWeight: "700",
          fontSize: 12,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function splitName(full: string): { first_name: string; last_name: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "Member", last_name: "User" };
  if (parts.length === 1) return { first_name: parts[0]!, last_name: "User" };
  return {
    first_name: parts[0]!,
    last_name: parts.slice(1).join(" "),
  };
}

export default function UserSettingsScreen() {
  const router = useRouter();
  const { user, refreshUser, setUserAvatar } = useAuth();
  const settings = useAppSettings();
  const isSystemAdmin = isSystemAdministrator({
    accountType: user?.accountType,
    legacyAccountType: user?.account_type,
    role: user?.role,
  });
  const canEditAccountType = canEditOwnAccountType({
    role: user?.role,
    accountType: user?.accountType,
    legacyAccountType: user?.account_type,
  });
  const accountTypeOptions = ADMIN_ASSIGNABLE_ACCOUNT_TYPES;

  const [name, setName] = useState((user?.name ?? "").trim());
  const [email, setEmail] = useState((user?.email ?? "").trim());
  const [accountType, setAccountType] = useState<NormalizedAccountType>(
    normalizeAccountType(user?.accountType, user?.account_type),
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    user?.avatar_url ?? null,
  );
  const [draft, setDraft] = useState<AppSettings>(settings);

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [identitySaved, setIdentitySaved] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  /** When true, ignore profile avatar_url sync so a fresh upload stays visible. */
  const keepLocalAvatarPreview = useRef(false);
  const [hostedAvatarLabel, setHostedAvatarLabel] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setName((user?.name ?? "").trim());
    setEmail((user?.email ?? "").trim());
    setAccountType(normalizeAccountType(user?.accountType, user?.account_type));
    if (keepLocalAvatarPreview.current) return;
    setAvatarUrl(user?.avatar_url ?? null);
    setHostedAvatarLabel(
      user?.avatar_url && !String(user.avatar_url).startsWith("data:")
        ? String(user.avatar_url)
        : null,
    );
  }, [
    user?.id,
    user?.name,
    user?.email,
    user?.accountType,
    user?.account_type,
    user?.avatar_url,
  ]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const res = await getRemoteAppSettings();
      if (!mounted) return;
      if (res.data) {
        const merged = await updateAppSettings(res.data as Partial<AppSettings>);
        if (mounted) setDraft(merged);
      } else if (res.error) {
        toast.error(res.error);
      }
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const accountName = name.trim() || (user?.name ?? "").trim();
  const accountTypeHint = useMemo(() => {
    if (isSystemAdmin) {
      return "As system administrator you can assign any pricing tier, including Private.";
    }
    return `Your account type is ${accountTypeLabel(accountType)}. Only the system administrator can change it.`;
  }, [accountType, isSystemAdmin]);

  const clearAvatar = () => {
    keepLocalAvatarPreview.current = false;
    setAvatarUrl(null);
    setHostedAvatarLabel(null);
    setUserAvatar(null);
    if (user?.id) {
      invalidateAvatarDisplayCache(`/owners/${user.id}/avatar`);
    }
    setProfileSaved(false);
  };

  const onImageSelected = async (dataUrl: string) => {
    // Show the clipped photo immediately in settings + header.
    keepLocalAvatarPreview.current = true;
    setAvatarUrl(dataUrl);
    setHostedAvatarLabel(null);
    setUserAvatar(dataUrl);
    setProfileSaved(false);
    setPickerOpen(false);
    setUploadingAvatar(true);

    const res = await uploadProfileAvatar(dataUrl);
    setUploadingAvatar(false);
    if (res.error || !res.data?.avatar_url) {
      toast.error(res.error ?? "Could not upload avatar.");
      return;
    }

    const remote = String(res.data.avatar_url).trim();
    const thinPath =
      user?.id != null
        ? absolutizeAvatarUrl(`/owners/${user.id}/avatar`)
        : remote;

    setHostedAvatarLabel(remote);
    setAvatarUrl(dataUrl);
    // Seed cache before refresh so swapping to the thin URL stays instant.
    primeAvatarDisplayCache(thinPath, dataUrl);
    await refreshUser();
    primeAvatarDisplayCache(thinPath, dataUrl);
  };

  const onSaveProfile = async () => {
    if (!user?.id) {
      toast.error("Not signed in.");
      return;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }
    const { first_name, last_name } = splitName(name);
    setSavingProfile(true);
    setProfileSaved(false);

    const payload: Parameters<typeof updateOwnerProfile>[1] = {
      first_name,
      last_name,
      email: trimmedEmail,
    };
    // Prefer hosted URL / thin path; never re-POST a huge local data URL.
    // Empty string clears; omit when we only have an unsaved local preview.
    if (!avatarUrl && !hostedAvatarLabel) {
      payload.avatar_url = "";
    } else if (hostedAvatarLabel) {
      payload.avatar_url = hostedAvatarLabel;
    } else if (avatarUrl && !avatarUrl.startsWith("data:")) {
      payload.avatar_url = avatarUrl;
    }
    if (canEditAccountType) {
      payload.account_type = toApiAccountType(accountType);
    }

    const res = await updateOwnerProfile(user.id, payload);
    if (res.error) {
      toast.error(res.error);
      setSavingProfile(false);
      return;
    }
    await refreshUser();
    keepLocalAvatarPreview.current = false;
    if (user?.id) {
      const thinPath = absolutizeAvatarUrl(`/owners/${user.id}/avatar`);
      if (avatarUrl?.startsWith("data:")) {
        primeAvatarDisplayCache(thinPath, avatarUrl);
      } else {
        invalidateAvatarDisplayCache(thinPath);
      }
    }
    setProfileSaved(true);
    setSavingProfile(false);
  };

  const onSaveIdentity = async () => {
    setSavingIdentity(true);
    setIdentitySaved(false);
    const res = await updateRemoteAppSettings(draft);
    if (res.error) {
      toast.error(res.error);
      setSavingIdentity(false);
      return;
    }
    const merged = await updateAppSettings(
      (res.data as Partial<AppSettings>) ?? draft,
    );
    setDraft(merged);
    await refreshUser();
    setIdentitySaved(true);
    setSavingIdentity(false);
  };

  return (
    <GradientBackground>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          <ScreenHeader
            title="User settings"
            subtitle="Profile, address & broadcast name"
            showBack
            onBack={() => router.replace("/(tabs)")}
          />

          <View style={{ paddingHorizontal: 20 }}>
            {loading ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 8,
                }}
              >
                <ActivityIndicator color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Loading your settings…
                </Text>
              </View>
            ) : null}

            <SectionTitle>Profile</SectionTitle>
            <Card style={{ gap: 14 }}>
              <View style={{ alignItems: "center", gap: 12, paddingTop: 4 }}>
                <ProfileAvatarButton
                  size={88}
                  avatarUrl={avatarUrl}
                  name={name}
                  email={email}
                  inset={false}
                  accessibilityLabel="Upload profile photo"
                  onPress={() => setPickerOpen(true)}
                />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Button
                    label={uploadingAvatar ? "Uploading…" : "Upload photo"}
                    variant="secondary"
                    size="sm"
                    onPress={() => setPickerOpen(true)}
                    disabled={uploadingAvatar}
                  />
                  {avatarUrl ? (
                    <Button
                      label="Remove"
                      variant="ghost"
                      size="sm"
                      onPress={clearAvatar}
                      disabled={uploadingAvatar}
                    />
                  ) : null}
                </View>
                {avatarUrl || hostedAvatarLabel ? (
                  <Text
                    style={{
                      color: colors.textDim,
                      fontSize: 11,
                      textAlign: "center",
                    }}
                    selectable
                  >
                    {hostedAvatarLabel
                      ? `Hosted at: ${hostedAvatarLabel}`
                      : uploadingAvatar
                        ? "Uploading photo…"
                        : "Photo ready"}
                  </Text>
                ) : null}
              </View>

              <Field
                label="Name"
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  setProfileSaved(false);
                }}
                placeholder="Your display name"
                autoCapitalize="words"
              />
              <Field
                label="Email"
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  setProfileSaved(false);
                }}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <View style={{ gap: 6 }}>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 11,
                    fontWeight: "700",
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                  }}
                >
                  Role
                </Text>
                <Text style={{ color: colors.textDim, fontSize: 11 }}>
                  {accountTypeHint}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  {accountTypeOptions.map((option) => (
                    <TypeChip
                      key={option.value}
                      label={option.label}
                      active={accountType === option.value}
                      disabled={!canEditAccountType}
                      onPress={() => {
                        if (!canEditAccountType) return;
                        setAccountType(option.value);
                        setProfileSaved(false);
                      }}
                    />
                  ))}
                </View>
              </View>

              <Button
                label={
                  savingProfile
                    ? "Saving…"
                    : profileSaved
                      ? "Profile saved"
                      : "Save profile"
                }
                onPress={() => void onSaveProfile()}
                disabled={savingProfile || uploadingAvatar}
                fullWidth
              />
            </Card>

            <SectionTitle>Address & broadcast</SectionTitle>
            <Card style={{ gap: 14 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Neighbours only see your broadcast name. Leave it blank to use
                your account name
                {accountName ? ` (${accountName})` : ""} in messages.
              </Text>
              <Field
                label="Broadcast name"
                value={draft.broadcastName}
                onChangeText={(v) => {
                  setIdentitySaved(false);
                  setDraft((prev) => ({ ...prev, broadcastName: v }));
                }}
                placeholder={accountName || "e.g. Neighbour alias"}
                autoCapitalize="words"
              />
              <AddressAutocompleteInput
                label="Address"
                value={draft.address}
                onChange={(addr) => {
                  setIdentitySaved(false);
                  setDraft((prev) => ({ ...prev, address: addr }));
                }}
                placeholder="169 Fred Young Drive, Toronto, Ontario"
              />
              <Text style={{ color: colors.textDim, fontSize: 11, marginTop: -8 }}>
                Start typing and pick a suggestion to set your home address.
              </Text>
              <Button
                label={
                  savingIdentity
                    ? "Saving…"
                    : identitySaved
                      ? "Saved"
                      : "Update address & broadcast name"
                }
                onPress={() => void onSaveIdentity()}
                disabled={loading || savingIdentity}
                fullWidth
              />
            </Card>

          </View>
        </ScrollView>
      </SafeAreaView>

      <AvatarUploadModal
        visible={pickerOpen}
        uploading={uploadingAvatar}
        onClose={() => {
          if (!uploadingAvatar) setPickerOpen(false);
        }}
        onImageSelected={(dataUrl) => {
          void onImageSelected(dataUrl);
        }}
        onError={(message) => toast.error(message)}
      />
    </GradientBackground>
  );
}
