import { AppLogo } from '@/components/shared/app-logo';
import { Separator } from '@/components/ui/separator';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <AppLogo href="/" size="sm" textClassName="text-2xl" className="mb-6" />
      {children}
      <p className="text-center text-sm text-muted-foreground mt-6">Infer · Map · Regress</p>
    </div>
  );
}
