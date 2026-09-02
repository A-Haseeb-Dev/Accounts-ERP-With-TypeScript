import { cn } from '@/lib/utils';

function Card({
  className,
  children,
  ...props
}: { className?: string; children?: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05),0_4px_16px_-4px_rgba(15,23,42,0.06)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function CardHeader({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn('flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4', className)}>{children}</div>;
}

function CardTitle({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <h3 className={cn('text-sm font-semibold tracking-tight text-slate-800', className)}>{children}</h3>;
}

function CardBody({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Body = CardBody;

export { Card, CardHeader, CardTitle, CardBody };
