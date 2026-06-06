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
          DEFAULT: "#FFFFFF",
          elevated: "#F3F7FD",
          card: "#F7FAFE",
          surface: "#EDF3FB",
          muted: "#E4ECF7",
        },
        accent: {
          DEFAULT: "#2F80ED",
          soft: "#5AA2F7",
          deep: "#1B5BB5",
          glow: "#2F80ED1F",
        },
        text: {
          DEFAULT: "#0F2C5C",
          muted: "#566784",
          dim: "#8694AC",
        },
        border: {
          DEFAULT: "#DCE6F2",
          strong: "#C2D2E6",
        },
        success: "#2FA24A",
        danger: "#E23B4E",
        warning: "#E0992A",
      },
      fontFamily: {
        sans: ["System"],
      },
    },
  },
  plugins: [],
};
