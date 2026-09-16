'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { SocialAuthButtons } from '@/components/auth/social-auth-buttons';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Spinner } from '@/components/ui/spinner';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('demo@servicelens.com');
  const [password, setPassword] = useState('demo123');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await signIn('credentials', { email, password, redirect: false }).catch(() => undefined);
    setLoading(false);
    if (res?.error) {
      toast.error('Invalid credentials');
      return;
    }
    if (!res?.ok) {
      toast.error('Could not reach the server to sign in. Try again.');
      return;
    }
    toast.success('Welcome back');
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use the seeded demo account or your own credentials.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit}>
          <FieldSet>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Spinner /> : 'Sign in'}
              </Button>
              <FieldSeparator>or</FieldSeparator>
              <SocialAuthButtons />
            </FieldGroup>
          </FieldSet>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <FieldDescription className="text-center">
          New here? <Link href="/register">Create an account</Link>
        </FieldDescription>
      </CardFooter>
    </Card>
  );
}
