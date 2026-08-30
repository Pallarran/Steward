import Image from "next/image";
import { requireAuth } from "@/lib/auth/require-auth";
import { Button } from "@/components/ui/button";
import { logout } from "./actions";

export default async function HomePage() {
  const { user } = await requireAuth();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <Image src="/steward-mark.png" alt="" width={72} height={72} priority className="h-18 w-18" />

      <div className="flex flex-col items-center gap-1">
        <h1 className="text-[21px] font-bold tracking-[-0.02em]">Steward</h1>
        <p className="text-[13px] text-muted-foreground">Signed in as {user.displayName}.</p>
      </div>

      {/* The sidebar, stat row, gate card, queue and Today card arrive in step 2. */}
      <form action={logout}>
        <Button type="submit" variant="ghost" className="text-[13px] text-muted-foreground">
          Sign out
        </Button>
      </form>
    </main>
  );
}
