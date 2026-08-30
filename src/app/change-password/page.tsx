import { redirect } from "next/navigation";
import { validateSession } from "@/lib/auth/session";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "Set a password · Steward" };

export default async function ChangePasswordPage() {
  // Not requireAuth: that redirects here when mustChangePassword is set, so
  // using it would loop.
  const session = await validateSession();
  if (!session) redirect("/login");

  const forced = session.user.mustChangePassword;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="flex w-full max-w-[340px] flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-[21px] font-bold tracking-[-0.02em]">
            {forced ? "Set a password" : "Change your password"}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {forced
              ? "The seeded password is temporary. Pick your own before going further."
              : "Changing it signs out every other device."}
          </p>
        </div>

        <div className="w-full rounded-lg border bg-card p-6">
          <ChangePasswordForm requireCurrent={!forced} />
        </div>
      </div>
    </main>
  );
}
