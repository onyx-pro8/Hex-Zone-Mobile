export const colors = {
  bg: "#0A0A0F",
  bgElevated: "#11111A",
  bgCard: "#15151F",
  bgSurface: "#1B1B27",
  bgMuted: "#22222F",

  accent: "#FF2DAA",
  accentSoft: "#FF55BC",
  accentDeep: "#C2148C",
  accentGlow: "rgba(255, 45, 170, 0.2)",

  text: "#F5F5F7",
  textMuted: "#A0A0AE",
  textDim: "#6E6E80",

  border: "#2A2A3A",
  borderStrong: "#3A3A52",

  success: "#23D9A0",
  danger: "#FF4D6D",
  warning: "#FFB547",
} as const;

export const gradients = {
  background: ["#0A0A0F", "#1A0B1A", "#0A0A0F"] as const,
  accent: ["#FF2DAA", "#C2148C"] as const,
  card: ["#1B1B27", "#15151F"] as const,
  glow: ["rgba(255,45,170,0.35)", "rgba(255,45,170,0)"] as const,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  accent: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 10,
  },
};
