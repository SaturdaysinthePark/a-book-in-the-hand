/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        bg:        'var(--bg)',
        'bg-2':    'var(--bg-2)',
        paper:     'var(--paper)',
        ink:       'var(--ink)',
        'ink-2':   'var(--ink-2)',
        muted:     'var(--muted)',
        accent:    'var(--accent)',
        'accent-2':'var(--accent-2)',
        highlight: 'var(--highlight)',
      },
      fontFamily: {
        serif: 'var(--serif)',
        sans:  'var(--sans)',
        mono:  'var(--mono)',
      },
      maxWidth: {
        content: 'var(--maxw)',
      },
    },
  },
  plugins: [],
  corePlugins: {
    listStyleType: false,
    listStylePosition: false,
  },
}
