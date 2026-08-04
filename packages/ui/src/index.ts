// Barrel for `@acme/ui`. Named exports only.
// Consumers should import from `@acme/ui` (mapped to this file via the root
// tsconfig.base.json paths) rather than reaching into `@acme/ui/src/*` paths.

export { cn } from './lib/cn';

export { Button, buttonVariants, type ButtonProps } from './components/button';
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './components/card';
export { Input, type InputProps } from './components/input';
export { Toaster, toast, type ToasterProps } from './components/toaster';
export {
  ThemeProvider,
  type ThemeProviderProps,
} from './components/theme-provider';
export { ThemeToggle } from './components/theme-toggle';
export {
  AppShell,
  type AppShellProps,
  type AppShellNavItem,
} from './components/app-shell';
export {
  ChatShell,
  type ChatShellProps,
  type ChatShellMessage,
} from './components/chat-shell';
