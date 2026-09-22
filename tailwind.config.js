/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          page: '#F4F6F7',
          card: '#FFFFFF',
          panel: '#EEF2F4',
        },
        ink: {
          main: '#29333A',
          sub: '#65747C',
          label: '#65747C',
        },
        line: {
          card: '#DCE2E6',
          table: '#E6EBEE',
        },
        accent: {
          blue: '#2D7DD2',
          green: '#3DAA7B',
        },
        status: {
          ok: '#3DAA7B',
          warn: '#E8A838',
          danger: '#E55B4D',
          normal: '#9B9B97',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08)',
      },
      borderRadius: {
        DEFAULT: '8px',
      },
    },
  },
  plugins: [],
};
