/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cream:  '#FDFBF7',
        cream2: '#F5F0E8',
        sand:   '#E8E2D7',
        sand2:  '#F0EBE3',
        line:   '#c4baa8',
        ink: {
          DEFAULT: '#2D2D2D',
          soft:    '#5C5C5C',
          muted:   '#a89e8c',
        },
        marrs: {
          DEFAULT: '#008f8f',
          soft:    '#2E9E8F',
          dark:    '#006a6a',
          deep:    '#14564E',
          50:      '#e0f5f1',
        },
        terra: {
          DEFAULT: '#B85A40',
          soft:    '#E07A5F',
        },
        warn:    '#c97a2a',
        danger:  '#B83A3A',
        success: '#1A7A6D',
      },
      fontFamily: {
        serif: ['"DM Serif Display"', '"Cormorant Garamond"', 'Georgia', 'serif'],
        cormorant: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '4px',
        lg: '8px',
      },
      boxShadow: {
        soft:  '0 1px 2px rgba(45,45,45,0.04)',
        md:    '0 4px 16px rgba(45,45,45,0.08)',
        lg:    '0 12px 40px rgba(45,45,45,0.12)',
        marrs: '0 8px 28px rgba(0,143,143,0.18)',
      },
    },
  },
  plugins: [],
}
