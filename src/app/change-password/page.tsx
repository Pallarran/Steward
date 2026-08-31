import { redirect } from "next/navigation";
import { validateSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/shell/panel";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "Set a password · Steward" };

/**
 * Written in the app's own vocabulary.
 *
 * This and `/login` were the only two files in the project still on Tailwind's
 * rem scale — `p-6`, `gap-6`, `rounded-lg`, `text-xs` — and between them they
 * had a third copy of `PageHeader`'s markup. They are also the first screen
 * anyone sees, so being the two least consistent pages was the wrong way round.
 */
export default async function ChangePasswordPage() {
  // Not requireAuth: that redirects here when mustChangePassword is set, so
  // using it would loop.
  const session = await validateSession();
  if (!session) redirect("/login");

  const forced = session.user.mustChangePassword;

  return (
    <main className="flex min-h-dvh items-center justify-center p-[24px]">
      <div className="flex w-full max-w-[340px] flex-col gap-[24px]">
        <PageHeader
          title={forced ? "Set a password" : "Change your password"}
          subtitle={
            forced
              ? "The seeded password is temporary. Pick your own before going further."
              : "Changing it signs out every other device."
          }
        />

        <Panel pad="lg" className="w-full">
          <ChangePasswordForm requireCurrent={!forced} />
        </Panel>
      </div>
    </main>
  );
}
