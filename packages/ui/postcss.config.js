// Shared PostCSS config for consumers of `@acme/ui`.
// Kept minimal: consumers copy this shape into their own
// `postcss.config.js` (or extend it) so Tailwind + autoprefixer run against
// the shared preset from `tailwind.preset.ts`.

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
