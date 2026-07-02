/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        border: 'rgb(var(--c-border) / <alpha-value>)',
        text: 'rgb(var(--c-text) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          soft: 'rgb(var(--c-accent-soft) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--c-danger) / <alpha-value>)',
          soft: 'rgb(var(--c-danger-soft) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--c-success) / <alpha-value>)',
          soft: 'rgb(var(--c-success-soft) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--c-warning) / <alpha-value>)',
          soft: 'rgb(var(--c-warning-soft) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        headline: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        metric: ['"Space Grotesk"', '"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '24px',
        '3xl': '28px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.03), 0 1px 1px rgb(0 0 0 / 0.02)',
        'card-hover': '0 16px 32px -12px rgb(0 0 0 / 0.10), 0 4px 10px -6px rgb(0 0 0 / 0.05)',
        float: '0 12px 40px -8px rgb(0 0 0 / 0.06)',
        button: '0 1px 2px rgb(0 0 0 / 0.04), 0 8px 16px -6px rgb(37 99 235 / 0.28)',
        'button-hover': '0 2px 4px rgb(0 0 0 / 0.05), 0 12px 24px -6px rgb(37 99 235 / 0.36)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        'pop-in': { from: { opacity: 0, transform: 'scale(0.96)' }, to: { opacity: 1, transform: 'scale(1)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out both',
        'pop-in': 'pop-in 0.25s cubic-bezier(0.16,1,0.3,1) both',
      },
    },
  },
  plugins: [],
}
