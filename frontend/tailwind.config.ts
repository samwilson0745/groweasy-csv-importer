import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff4ef",
          100: "#ffe6da",
          200: "#ffc9b3",
          300: "#ffa17d",
          400: "#ff7a4d",
          500: "#f9622e", // GrowEasy-style orange accent
          600: "#e04c1c",
          700: "#b93a14",
          800: "#8f2e13",
          900: "#742714",
        },
      },
    },
  },
  plugins: [],
};

export default config;
