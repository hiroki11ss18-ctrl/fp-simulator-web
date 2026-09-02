/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          page: '#F7F6F3',
          card: '#FFFFFF',
          panel: '#EFEDE9',
        },
        ink: {
          main: '#37352F',
          sub: '#787774',
          label: '#9B9B97',
        },
        line: {
          card: '#E9E8E3',
          table: '#F1F0EC',
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
