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
  title: 'ServiceLens — Git-native microservice topology & regression testing',
  description:
    'Infers API contracts and event flows from Git-backed microservices, maps live topology, and runs end-to-end regression tests with animated playback and real-time health rollups.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${display.variable} ${mono.variable} dark`}>
      <body className="min-h-screen bg-canvas text-ink font-sans antialiased">
        <AuthProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            <TooltipProvider delayDuration={150}>
              {children}
              <Toaster richColors position="bottom-right" />
            </TooltipProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
