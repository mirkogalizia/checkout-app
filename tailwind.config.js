/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#111827',
        }
      },
      boxShadow: {
        soft: '0 10px 30px rgba(0,0,0,0.06)'
      }
    },
  },
  plugins: [],
}