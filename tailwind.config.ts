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
          DEFAULT: "#00354E",
          50: "#EEF3F6",
          100: "#D9E5EC",
          200: "#B0CAD9",
          300: "#86AFC4",
          400: "#4D829B",
          500: "#16506B",
          600: "#00354E",
          700: "#002B41",
          800: "#002032",
          900: "#00141F",
        },
        accent: {
          DEFAULT: "#EB7400",
          50: "#FFF7E6",
          100: "#FFEFCF",
          200: "#FFDF9E",
          300: "#FFCF6B",
          400: "#FFBE29",
          500: "#F08A00",
          600: "#EB7400",
          700: "#C95F00",
          800: "#8A4000",
          900: "#4A2200",
        },
        maroon: {
          DEFAULT: "#8D153A",
          50: "#FBEBEE",
          100: "#F5CBD6",
          200: "#E99DB0",
          300: "#DB6B88",
          400: "#C63D63",
          500: "#A52450",
          600: "#8D153A",
          700: "#72112F",
          800: "#550C23",
          900: "#330615",
        },
        brand: {
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
        flag: {
          green: "#00534E",
        },
      },
    },
  },
  plugins: [],
};

export default config;
