import type { Metadata } from 'next';
import { Inter, Fraunces, JetBrains_Mono, Manrope, Space_Grotesk } from 'next/font/google';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { AuthProvider } from '@/components/providers/auth-provider';
import { AppToaster } from '@/components/providers/app-toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';
import { cn } from '@/lib/utils';

const spaceGroteskHeading = Space_Grotesk({ subsets: ['latin'], variable: '--font-heading' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-sans' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['SOFT', 'opsz'],
});
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'ServiceLens — the mesh, observed',
  description:
    'Onboard your microservices from GitHub, map their dependencies from code, monitor every app and datastore, and get incidents, on-call paging, AI root-cause analysis and draft fix PRs automatically.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        inter.variable,
        display.variable,
        mono.variable,
        'font-sans',
        manrope.variable,
        spaceGroteskHeading.variable
      )}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <AuthProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <TooltipProvider delay={150}>
              {children}
              <AppToaster />
            </TooltipProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
