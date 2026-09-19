import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        apply: "#1a7f37",
        review: "#9a6700",
        skip: "#57606a",
      },
    },
  },
  plugins: [],
};

export default config;
