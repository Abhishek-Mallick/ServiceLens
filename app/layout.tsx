import type { Metadata } from 'next';
import { Inter, Fraunces, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { AuthProvider } from '@/components/providers/auth-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from 'sonner';
import './globals.css';

// Inter — UI body. ABC Favorit's open-source stand-in role is also Inter here.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
// Fraunces — open-source editorial serif standing in for Domaine Display per DESIGN.md.
const display = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap', axes: ['SOFT', 'opsz'] });
// JetBrains Mono — code-window monospace.
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'ServiceLens — the mesh, observed',
  description:
    'Onboard your microservices from GitHub, map their dependencies from code, monitor every app and datastore, and get incidents, on-call paging, AI root-cause analysis and draft fix PRs automatically.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${display.variable} ${mono.variable} dark`}>
      <body className="min-h-screen bg-canvas text-ink font-sans antialiased">
        <AuthProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            <TooltipProvider delayDuration={150}>
              {children}
              <Toaster
                theme="dark"
                position="bottom-right"
                toastOptions={{
                  // DESIGN.md surfaces instead of sonner's own light palette.
                  classNames: {
                    toast: 'bg-surface-elevated border border-hairline-strong text-ink',
                    description: 'text-mute',
                    success: '[&_[data-icon]]:text-accent-green',
                    error: '[&_[data-icon]]:text-accent-red',
                    warning: '[&_[data-icon]]:text-accent-orange',
                    info: '[&_[data-icon]]:text-accent-blue',
                  },
                }}
              />
            </TooltipProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
