/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{vue,js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        note: {
          yellow: '#fff9c4',
          pink: '#fce4ec',
          blue: '#e3f2fd',
          green: '#e8f5e9',
          purple: '#f3e5f5',
          gray: '#f5f5f5'
        },
        accent: {
          yellow: '#fbc02d',
          pink: '#ec407a',
          blue: '#42a5f5',
          green: '#66bb6a',
          purple: '#ab47bc',
          gray: '#9e9e9e'
        }
      },
      fontFamily: {
        sans: [
          'Segoe UI',
          'Microsoft YaHei',
          'PingFang SC',
          'system-ui',
          'sans-serif'
        ],
        mono: ['Cascadia Code', 'Consolas', 'Courier New', 'monospace']
      }
    }
  },
  plugins: []
}
