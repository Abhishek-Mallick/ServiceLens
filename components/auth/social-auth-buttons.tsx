'use client';

import Image from 'next/image';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';

type SocialAuthButtonsProps = {
  callbackUrl?: string;
};

export function SocialAuthButtons({ callbackUrl = '/dashboard' }: SocialAuthButtonsProps) {
  return (
    <ButtonGroup className="w-full">
      <Button
        type="button"
        variant="outline"
        className="flex-1"
        onClick={() => signIn('github', { callbackUrl })}
      >
        <Image src="/github.png" alt="" width={16} height={16} className="size-4 shrink-0 dark:invert" />
        GitHub
      </Button>
      <Button
        type="button"
        variant="outline"
        className="flex-1"
        onClick={() => signIn('google', { callbackUrl })}
      >
        <Image src="/Google.png" alt="" width={16} height={16} className="size-4 shrink-0" />
        Google
      </Button>
    </ButtonGroup>
  );
}
