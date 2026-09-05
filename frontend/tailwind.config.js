/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Outfit', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        ethereal: {
          bg: '#0c0d12',
          surface: '#13151f',
          card: 'rgba(21, 24, 35, 0.78)',
          border: 'rgba(255, 255, 255, 0.08)',
          lime: '#86efac',
          limeGlow: '#4ade80',
          purple: '#a855f7',
          lavender: '#c084fc',
          rose: '#f43f5e',
          amber: '#fbbf24',
          muted: '#8e95a5',
        }
      }
    },
  },
  plugins: [],
}
