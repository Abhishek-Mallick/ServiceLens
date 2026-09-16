'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';

function PasswordInput({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);

  return (
    <InputGroup className={className}>
      <InputGroupInput
        type={visible ? 'text' : 'password'}
        {...props}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          variant="ghost"
          aria-label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((show) => !show)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

export { PasswordInput };
