/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0fafa",
          100: "#d0f0f0",
          200: "#a0e0e0",
          300: "#60caca",
          400: "#2aadad",
          500: "#1A7B7E",
          600: "#156264",
          700: "#104a4c",
          800: "#0a3334",
          900: "#051a1b",
        },
      },
    },
  },
  plugins: [],
};
