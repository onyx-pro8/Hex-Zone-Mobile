/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Brand
        bg: {
          DEFAULT: "#0A0A0F",
          elevated: "#11111A",
          card: "#15151F",
          surface: "#1B1B27",
          muted: "#22222F",
        },
        accent: {
          DEFAULT: "#FF2DAA",
          soft: "#FF55BC",
          deep: "#C2148C",
          glow: "#FF2DAA33",
        },
        text: {
          DEFAULT: "#F5F5F7",
          muted: "#A0A0AE",
          dim: "#6E6E80",
        },
        border: {
          DEFAULT: "#2A2A3A",
          strong: "#3A3A52",
        },
        success: "#23D9A0",
        danger: "#FF4D6D",
        warning: "#FFB547",
      },
      fontFamily: {
        sans: ["System"],
      },
    },
  },
  plugins: [],
};
