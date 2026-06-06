export const colors = {
  bg: "#FFFFFF",
  bgElevated: "#F3F7FD",
  bgCard: "#F7FAFE",
  bgSurface: "#EDF3FB",
  bgMuted: "#E4ECF7",

  accent: "#2F80ED",
  accentSoft: "#5AA2F7",
  accentDeep: "#1B5BB5",
  accentGlow: "rgba(47, 128, 237, 0.12)",

  text: "#0F2C5C",
  textMuted: "#566784",
  textDim: "#8694AC",

  border: "#DCE6F2",
  borderStrong: "#C2D2E6",

  success: "#2FA24A",
  danger: "#E23B4E",
  warning: "#E0992A",
} as const;

export const gradients = {
  background: ["#FFFFFF", "#EFF5FD", "#FFFFFF"] as const,
  accent: ["#2F80ED", "#1B5BB5"] as const,
  card: ["#FFFFFF", "#F4F8FF"] as const,
  glow: ["rgba(47,128,237,0.12)", "rgba(47,128,237,0)"] as const,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 9999,
} as const;

export const shadow = {
  card: {
    shadowColor: "#1B3A6B",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  accent: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
};
