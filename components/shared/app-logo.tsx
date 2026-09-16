import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const sizeConfig = {
  sm: { icon: 28, text: 'text-lg' },
  md: { icon: 32, text: 'text-xl' },
  lg: { icon: 40, text: 'text-2xl' },
} as const;

type AppLogoProps = {
  className?: string;
  textClassName?: string;
  href?: string;
  showText?: boolean;
  size?: keyof typeof sizeConfig;
};

export function AppLogo({
  className,
  textClassName,
  href,
  showText = true,
  size = 'md',
}: AppLogoProps) {
  const { icon, text } = sizeConfig[size];

  const content = (
    <>
      <Image
        src="/servicelens-logo.png"
        alt=""
        width={icon}
        height={icon}
        className="shrink-0 dark:invert "
        priority
      />
      {showText ? (
        <span
          className={cn(
            'font-heading font-bold tracking-tight text-foreground',
            text,
            textClassName
          )}
        >
          ServiceLens
        </span>
      ) : null}
    </>
  );

  const rootClassName = cn('inline-flex items-center gap-1', className);

  if (href) {
    return (
      <Link href={href} className={rootClassName} aria-label="ServiceLens">
        {content}
      </Link>
    );
  }

  return <div className={rootClassName}>{content}</div>;
}
