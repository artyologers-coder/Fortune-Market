import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0F6E56",
          50: "#E8F5F0",
          100: "#C5E8DB",
          200: "#8FD1B7",
          300: "#59BA93",
          400: "#2F9470",
          500: "#0F6E56",
          600: "#0B5A46",
          700: "#084636",
          800: "#053226",
          900: "#021E16",
        },
        accent: {
          DEFAULT: "#854F0B",
          50: "#FDF3E8",
          100: "#F9E2C2",
          200: "#F0C484",
          300: "#E7A646",
          400: "#B87A1E",
          500: "#854F0B",
          600: "#6B3F09",
          700: "#513007",
          800: "#372004",
          900: "#1D1002",
        },
      },
    },
  },
  plugins: [],
};

export default config;
