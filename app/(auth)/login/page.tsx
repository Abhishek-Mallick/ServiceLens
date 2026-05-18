'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Github, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('demo@servicelens.com');
  const [password, setPassword] = useState('demo123');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      toast.error('Invalid credentials');
      return;
    }
    toast.success('Welcome back');
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md border-border/60">
      <CardHeader>
        <CardTitle className="text-2xl">Sign in</CardTitle>
        <CardDescription>
          Use the seeded demo account or your own credentials.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
          </Button>
        </form>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="w-full" onClick={() => signIn('github', { callbackUrl: '/dashboard' })}>
            <Github className="h-4 w-4" /> GitHub
          </Button>
          <Button variant="outline" className="w-full" onClick={() => signIn('google', { callbackUrl: '/dashboard' })}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
              <path fill="#fff" d="M21.35 11.1H12v3.2h5.36a4.6 4.6 0 0 1-1.99 3.02v2.5h3.21c1.88-1.73 2.96-4.28 2.96-7.32 0-.77-.07-1.5-.19-2.4z"/>
              <path fill="#fff" opacity=".85" d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.2-2.5c-.89.6-2.03.96-3.41.96-2.62 0-4.83-1.77-5.63-4.15H3.07v2.6A10 10 0 0 0 12 22z"/>
              <path fill="#fff" opacity=".7" d="M6.37 13.88a6 6 0 0 1 0-3.76V7.52H3.07a10 10 0 0 0 0 8.96l3.3-2.6z"/>
              <path fill="#fff" opacity=".55" d="M12 6.1c1.47 0 2.78.5 3.82 1.5l2.86-2.86C16.96 3.2 14.7 2 12 2A10 10 0 0 0 3.07 7.52l3.3 2.6C7.17 7.87 9.38 6.1 12 6.1z"/>
            </svg>
            Google
          </Button>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          New here?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
