/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: {
          DEFAULT: '#244a5c',
          dark: '#1b3847',
          hover: '#2d596e',
        },
        canvas: {
          DEFAULT: '#dcebf2',
          subtle: '#eef6fa',
        },
        navy: {
          950: '#0b141c',
          900: '#101d28',
          850: '#152533',
          800: '#1a2e3f',
          700: '#243d52',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 2px 12px rgba(26, 56, 72, 0.06)',
        'card-hover': '0 6px 18px rgba(26, 56, 72, 0.10)',
      },
    },
  },
  plugins: [],
};
