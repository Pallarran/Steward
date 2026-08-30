import { requireAuth } from "@/lib/auth/require-auth";

/**
 * Everything behind the login lives under this route group. A new page is
 * therefore behind it by construction rather than by remembering to check.
 *
 * The sidebar and content frame land here in step 2.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireAuth();
  return children;
}
