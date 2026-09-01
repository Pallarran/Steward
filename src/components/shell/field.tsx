import { Label } from "@/components/ui/label";

/**
 * A labelled control inside a dialog: 12px muted label, the control, and an
 * optional hint underneath.
 *
 * Lives here rather than beside the first dialog that needed it, because
 * Documents needs the same thing and importing it across route folders is how
 * a shared component ends up copied instead.
 */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-[4px]">
      <Label className="text-[13px] text-muted-foreground">{label}</Label>
      {children}
      {hint ? <span className="text-[12px] leading-[1.5] text-faint">{hint}</span> : null}
    </label>
  );
}
