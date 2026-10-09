/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        blush: { 50: '#fdf6f5', 100: '#fbeae8', 200: '#f6d5d1', 300: '#eeb6af', 400: '#e48f86', 500: '#d46d63' },
        sage: { 50: '#f5f8f4', 100: '#e6eee3', 200: '#cddcc7', 300: '#a9c2a0', 400: '#82a177', 500: '#628357' },
        cream: { 50: '#fffdf9', 100: '#fbf7f0', 200: '#f4ece0' },
        ink: { 500: '#6b6259', 700: '#4a423b', 900: '#2b2622' },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
