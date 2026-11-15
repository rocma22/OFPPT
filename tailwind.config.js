/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#6C5CE7',
          light: '#F4F2FF',
        },
        ink: '#1F2430',
      },
      borderRadius: {
        card: '16px',
      },
      boxShadow: {
        card: '0 8px 30px rgba(31, 36, 48, 0.06)',
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans Arabic', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
