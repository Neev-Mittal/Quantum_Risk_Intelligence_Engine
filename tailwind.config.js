/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pnb: {
          crimson:  '#8B0000',
          red:      '#CC0000',
          darkred:  '#5C0000',
          gold:     '#F59E0B',
          amber:    '#D97706',
          light:    '#FCD34D',
          cream:    '#FFF8E7',
        },
      },
      fontFamily: {
        display: ['Oxanium', 'sans-serif'],
        body:    ['DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
