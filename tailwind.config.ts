import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ── XPLORIX COLOR PALETTE ──────────────────────────────────────────
      colors: {
        // Backgrounds
        'xpl-bg':    '#080B10',
        'xpl-bg2':   '#0D1117',
        'xpl-bg3':   '#111827',
        'xpl-bg4':   '#1A2234',

        // Borders
        'xpl-border': '#1E293B',

        // Text
        'xpl-text':   '#F8FAFC',
        'xpl-muted':  '#94A3B8',
        'xpl-dim':    '#64748B',
        'xpl-faint':  '#334155',

        // Primary - Orange
        'xpl-orange':     '#F97316',
        'xpl-orange-dim': '#EA580C',

        // Secondary - Blue
        'xpl-blue':        '#3B82F6',
        'xpl-blue-bright': '#60A5FA',

        // Status
        'xpl-green':  '#10B981',
        'xpl-red':    '#EF4444',
        'xpl-amber':  '#F59E0B',
        'xpl-purple': '#8B5CF6',
        'xpl-cyan':   '#06B6D4',
      },

      // ── FONTS ──────────────────────────────────────────────────────────
      fontFamily: {
        sans:    ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Fira Code', 'monospace'],
      },

      // ── BORDER RADIUS ─────────────────────────────────────────────────
      borderRadius: {
        'xl':  '12px',
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '24px',
      },

      // ── BOX SHADOWS ───────────────────────────────────────────────────
      boxShadow: {
        'orange-sm':  '0 4px 20px rgba(249,115,22,0.2)',
        'orange-md':  '0 8px 30px rgba(249,115,22,0.35)',
        'orange-lg':  '0 16px 60px rgba(249,115,22,0.25)',
        'blue-sm':    '0 4px 20px rgba(59,130,246,0.2)',
        'blue-md':    '0 8px 30px rgba(59,130,246,0.35)',
        'card':       '0 4px 24px rgba(0,0,0,0.3)',
        'card-lg':    '0 20px 60px rgba(0,0,0,0.4)',
      },

      // ── ANIMATIONS ────────────────────────────────────────────────────
      animation: {
        'pulse-slow':  'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float':       'float 6s ease-in-out infinite',
        'glow':        'glow 2s ease-in-out infinite alternate',
        'fade-in':     'fadeIn 0.4s ease-out',
        'slide-up':    'slideUp 0.4s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
        glow: {
          '0%':   { boxShadow: '0 0 10px rgba(249,115,22,0.2)' },
          '100%': { boxShadow: '0 0 30px rgba(249,115,22,0.5)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },

      // ── BACKGROUND GRADIENTS ──────────────────────────────────────────
      backgroundImage: {
        'gradient-orange':    'linear-gradient(135deg, #F97316, #EA580C)',
        'gradient-blue':      'linear-gradient(135deg, #3B82F6, #60A5FA)',
        'gradient-dark':      'linear-gradient(180deg, #0D1117 0%, #080B10 100%)',
        'gradient-card':      'linear-gradient(135deg, rgba(249,115,22,0.08), rgba(13,17,23,0.95))',
        'gradient-card-blue': 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(13,17,23,0.95))',
        'grid-pattern':       'linear-gradient(rgba(30,41,59,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(30,41,59,0.15) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
}

export default config
