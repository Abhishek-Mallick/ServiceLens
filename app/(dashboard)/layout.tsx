import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Sidebar } from '@/components/shared/sidebar';
import { Header } from '@/components/shared/header';
import { CommandPalette } from '@/components/shared/command-palette';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header user={session.user} />
        <main className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}
