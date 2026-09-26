import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F6F4EF", // page background, warm paper
        surface: "#FFFFFF", // cards
        sunken: "#F1EEE8", // inset wells, inactive controls
        line: "#E8E4DC",
        fg: "#1A1722",
        muted: "#6B6675",
        dim: "#A29DAA",
        accent: { DEFAULT: "#5B45F5", deep: "#4632D6", soft: "#EEEBFF" },
        coral: { DEFAULT: "#FF6A4D", soft: "#FFEDE8" },
        good: { DEFAULT: "#1F9D5B", soft: "#E6F6EC" },
        warn: { DEFAULT: "#B86E00", soft: "#FFF3DC" },
        bad: { DEFAULT: "#D93F3F", soft: "#FDECEC" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(26,23,34,0.04), 0 4px 16px -6px rgba(26,23,34,0.08)",
        lift: "0 2px 4px rgba(26,23,34,0.05), 0 16px 32px -12px rgba(26,23,34,0.18)",
        glow: "0 10px 30px -10px rgba(91,69,245,0.55)",
      },
    },
  },
  plugins: [],
};

export default config;
