// Tailwind config for `payment-user-web`. Spreads the shared `@acme/ui`
// preset so tokens/dark-mode strategy/plugins stay in lockstep with every
// other Next.js surface in the scaffold. `content` globs cover this app's
// own `src/**` tree plus the shared UI components (so their Tailwind classes
// are picked up by this app's build).

import type { Config } from 'tailwindcss';
import { tailwindPreset } from '@acme/ui/tailwind.preset';

const config: Config = {
  presets: [tailwindPreset],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};

export default config;
