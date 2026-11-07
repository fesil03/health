/** @type {import('tailwindcss').Config} */
// "Blue dial" tokens: a vintage watch face. Deep blue dial, aged-lume cream for
// what you act on, brushed steel for secondary text, and one orange hand for "now".
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        dial: { DEFAULT: '#15233B', raised: '#1C2C47', deep: '#0F1A2D', rule: '#2B3D5C' },
        lume: { DEFAULT: '#E9D9AE', dim: '#B8AB86' },
        steel: { DEFAULT: '#A9B4C4', dim: '#7C899D' },
        ink: '#F2EFE6',
        hand: '#E8743F',
        cat: {
          coffee: '#CDA36C',
          water: '#80B4E6',
          stool: '#BE8A57',
          supp: '#9FC79C',
          drink: '#D88EA2',
          sleep: '#4F6694'
        },
        warn: '#E8B85C',
        err: '#F0A08A'
      },
      fontFamily: {
        sans: ['"Archivo Variable"', 'system-ui', '-apple-system', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif']
      },
      fontSize: {
        xs: ['0.8125rem', '1.15rem'], // 13
        sm: ['0.9375rem', '1.35rem'], // 15
        base: ['1rem', '1.5rem'], // 16
        lg: ['1.25rem', '1.6rem'], // 20
        xl: ['1.5625rem', '1.9rem'], // 25
        '2xl': ['2rem', '2.2rem'] // 32
      }
    }
  },
  plugins: []
};
