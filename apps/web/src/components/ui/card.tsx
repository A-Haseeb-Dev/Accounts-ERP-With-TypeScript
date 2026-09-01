import { cn } from '@/lib/utils';

function Card({
  className,
  children,
  ...props
}: { className?: string; children?: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', className)} {...props}>
      {children}
    </div>
  );
}

function CardHeader({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn('border-b border-slate-100 px-5 py-4', className)}>{children}</div>;
}

function CardTitle({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <h3 className={cn('text-sm font-semibold text-slate-800', className)}>{children}</h3>;
}

function CardBody({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Body = CardBody;

export { Card, CardHeader, CardTitle, CardBody };