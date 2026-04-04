/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: 'rgb(var(--color-primary-rgb) / <alpha-value>)',
        court: '#1e3a5f',     // deep navy (court color)
        surface: '#1e293b',   // dark slate
        bg: '#000000',        // app background
      },
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'feedIn': {
          from: { opacity: '0', transform: 'translate(-50%, -8px)' },
          to:   { opacity: '1', transform: 'translate(-50%, 0)' },
        },
        'win-flash': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0' },
        },
        'slide-up': {
          '0%':   { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
      },
      animation: {
        'fade-in':   'fade-in 150ms ease-out forwards',
        'feed-in':   'feedIn 0.2s ease-out forwards',
        'win-flash': 'win-flash 0.4s ease-in-out infinite',
        'slide-up':  'slide-up 220ms cubic-bezier(0.16,1,0.3,1) forwards',
      },
    },
  },
  plugins: [],
}
