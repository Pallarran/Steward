import Image from "next/image";
import { redirect } from "next/navigation";
import { validateSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

/**
 * The first screen anyone sees.
 *
 * **The stacked lockup, at last.** It shipped as the square mark above a
 * hand-set `<h1>Steward</h1>` — a lockup rebuilt in CSS while the drawn one sat
 * unused in `Art/`. Two consequences fixed by using it: the wordmark is now
 * typeset by whoever drew it rather than by Inter at 21px, and the mark's gold
 * no longer sits 28px above a light-mode button in a *different* gold, which is
 * what a heading between them was making obvious.
 *
 * Written in the app's own px vocabulary. Both auth pages used Tailwind's rem
 * scale throughout — the only two files in the project that did.
 */
export default async function LoginPage() {
  // Not requireAuth: this page is the thing requireAuth redirects to.
  const session = await validateSession();
  if (session) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center p-[24px]">
      <div className="flex w-full max-w-[340px] flex-col items-center gap-[24px]">
        {/* 384 × 573 after trimming. `priority` because it is the only thing
            above the fold and the page has nothing else to render. */}
        <Image
          src="/steward-lockup.png"
          alt="Steward"
          width={132}
          height={197}
          priority
          style={{ width: 132, height: 197 }}
        />

        <div className="w-full rounded-[10px] border bg-card px-[20px] py-[18px]">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
