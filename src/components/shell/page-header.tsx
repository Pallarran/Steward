/**
 * Every page's opening line: a 21px title and a 13px subtitle that says what
 * the page currently thinks — "everything green, nothing to do", "3 renewing
 * soon". Eight pages hand-rolled this markup before it was a component.
 *
 * The subtitle is a **verdict, not a description**. It is the one place a page
 * gets to summarise itself, and repeating the title in prose wastes it.
 *
 * `action` sits at the right, for a page whose primary control belongs beside
 * the title rather than inside a section.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-baseline justify-between gap-[12px]">
      <div className="flex min-w-0 flex-col gap-[2px]">
        <h1 className="text-[21px] font-bold tracking-[-0.02em]">{title}</h1>
        {subtitle ? <p className="text-[13px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
