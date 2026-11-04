import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { marca: { DEFAULT: "#b45309", escuro: "#78350f" } } } },
} satisfies Config;
