/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // 시스템 설정(prefers-color-scheme)을 따라 다크 모드를 적용한다.
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // 8.2절 그룹 고정 색상. 모든 그래프에서 같은 색을 쓴다.
        grp: {
          fuel: '#2563EB',
          supply: '#16A34A',
          fixed: '#7C3AED',
          repair: '#EA580C',
          etc: '#6B7280',
        },
        warn: '#F59E0B',
        over: '#DC2626',
      },
    },
  },
  plugins: [],
}
