/** NSA Training Platform — design tokens extracted from the Figma file
 *  "NSA Training Platform UI Design" (Be Vietnam Pro, NSA gold accent). */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#001258", // Deep Midnight Navy (Màu chính: Tiêu đề, Header, Footer)
          dark: "#000e47",
          heading: "#001258",
          soft: "#082180",
        },
        royal: {
          DEFAULT: "#0532e6", // Electric / Royal Blue (Màu nhấn: Nút bấm, Icon, Link hover)
          hover: "#1e45ee",
          dark: "#0426b3",
          light: "#eff3ff",
        },
        slate: {
          charcoal: "#111c2c", // Màu chữ nội dung (Body text)
        },
        gtext: {
          DEFAULT: "#64748b", // Slate Charcoal secondary
          dark: "#111c2c",
        },
        gbg: "#f8fafc", // Màu nền trang web (Light Slate)
        gbg2: "#f1f5f9", // Light Slate 100
        gborder: "#e2e8f0", // Light Slate 200
        gold: {
          DEFAULT: "#C4A35A", // Champagne Gold (Màu nhấn phụ)
          dark: "#A88B4A",
          light: "#f7f3e8",
        },
        error: {
          DEFAULT: "#BA1A1A",
          bg: "#FFDAD6",
        },
        danger: {
          DEFAULT: "#DC2626",
          bg: "#FEE2E2",
        },
        success: {
          DEFAULT: "#137A4B",
          bg: "#DDF7E9",
        },
        info: {
          DEFAULT: "#0532e6",
          bg: "#eff3ff",
        },
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', "system-ui", "sans-serif"],
        calibri: ['Calibri', 'Carlito', '"Segoe UI"', 'sans-serif'],
        number: ['Calibri', 'Carlito', '"Segoe UI"', 'sans-serif'],
      },
      boxShadow: {
        card: "0 4px 24px rgba(7, 20, 38, 0.04), inset 0 1px 1px rgba(255, 255, 255, 0.95)",
        "card-hover": "0 8px 32px rgba(7, 20, 38, 0.08), inset 0 1px 1px rgba(255, 255, 255, 1)",
        glass: "0 8px 32px 0 rgba(10, 37, 64, 0.06), inset 0 1px 1px 0 rgba(255, 255, 255, 0.9)",
        "glass-elevated":
          "0 24px 64px rgba(7, 20, 38, 0.14), inset 0 1px 2px rgba(255, 255, 255, 0.95)",
        elevated: "0 16px 48px rgba(7, 20, 38, 0.14)",
      },
    },
  },
  plugins: [],
};
