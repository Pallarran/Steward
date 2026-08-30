import Image from "next/image";
import { redirect } from "next/navigation";
import { validateSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Steward" };

export default async function LoginPage() {
  // Not requireAuth: this page is the thing requireAuth redirects to.
  const session = await validateSession();
  if (session) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="flex w-full max-w-[340px] flex-col items-center gap-7">
        <div className="flex flex-col items-center gap-3">
          <Image
            src="/steward-mark.png"
            alt=""
            width={64}
            height={64}
            priority
            className="h-16 w-16"
          />
          <h1 className="text-[21px] font-bold tracking-[-0.02em]">Steward</h1>
        </div>

        <div className="w-full rounded-lg border bg-card p-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
