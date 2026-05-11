// Definition-list metadata row used by task and session detail pages.
export function Meta({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-foreground">
        {children}
        {hint && <span className="ml-1.5 text-muted-foreground">({hint})</span>}
      </dd>
    </div>
  );
}
