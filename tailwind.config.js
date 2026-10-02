/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: { extend: { fontFamily: { sans: ['var(--font-sans)', 'Noto Sans Thai', 'system-ui', 'sans-serif'] } } },
  plugins: [],
};
