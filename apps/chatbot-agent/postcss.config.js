// PostCSS pipeline for `chatbot-agent`: Tailwind + autoprefixer. Consumers of
// `@acme/ui` share this same shape (see `packages/ui/postcss.config.js`).

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
