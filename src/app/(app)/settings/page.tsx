import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/shell/panel";
import { SectionHead } from "@/components/shell/section";
import { AiTest } from "./ai-test";
import { checkAi } from "@/lib/ai";
import { Dot } from "@/components/shell/dot";
import { NotKnown } from "@/components/shell/not-known";

export const metadata = { title: "Settings · Steward" };

/**
 * What is genuinely global, and nothing else.
 *
 * **The news sources left on 2026-09-04**, to `/news`. `docs/DESIGN.md` states
 * the rule twice — *the controls that create, edit and arrange a thing live on
 * the page that shows it* — and it had been applied twice, to subscriptions and
 * to launcher tiles, on 2026-09-01. This was the one that stayed, and the
 * comment on this page's own verdict said so: *"a page called Settings that
 * manages news feeds is an odd shape, and by the same argument those sources
 * probably belong on `/news`. That is a separate decision and this is not it."*
 * This is it.
 *
 * What is left is one card, and that is the right size for a destination
 * reached from a gear icon in the rail rather than from the nav. It was the
 * second-tallest page in the app while being classed as chrome.
 *
 * **Everything else Vincent configures is an env var on WhiteTower**, surfaced
 * as `configured` on the page that needs it. The obvious gap is an account
 * card — `User.displayName`, `mustChangePassword` and `Session`'s user agent,
 * address and expiry all exist with no UI at all, on an app reachable over
 * Tailscale. That is a new component, so the PRD comes first.
 */
export default async function SettingsPage() {
  await requireAuth();

  return (
    <>
      <PageHeader title="Settings" subtitle="the local model" />
      <AiSection />
    </>
  );
}

/**
 * The local model.
 *
 * On Settings rather than Systems on purpose: `/systems` is the collectors and
 * the machines, and everything on it carries an "as of" and a staleness rule.
 * The model is neither — nothing polls it, nothing goes stale, and putting it
 * in that grid would promise a freshness it does not have. It sits here beside
 * the other thing Vincent configures with an env var and then forgets.
 *
 * Three states, said differently, because they need different things doing:
 * not configured is an instruction, not answering is a fault, and answering
 * without the model pulled is one command away from working.
 */
async function AiSection() {
  const ai = await checkAi();

  return (
    <Panel as="section" pad="lg" className="flex flex-col gap-[12px]">
      <SectionHead
        title="Local model"
        detail={ai.configured ? ai.model : undefined}
        action={
          ai.configured ? (
            <Dot tone={ai.connected ? (ai.modelAvailable ? "ok" : "stale") : "down"} size={9} ring />
          ) : null
        }
      />

      {!ai.configured ? (
        <NotKnown>
          Not connected. Set <code className="font-mono text-[13px]">OLLAMA_BASE_URL</code> and{" "}
          <code className="font-mono text-[13px]">OLLAMA_MODEL</code> in{" "}
          <code className="font-mono text-[13px]">.env</code> on WhiteTower, then rebuild.
        </NotKnown>
      ) : !ai.connected ? (
        <p className="text-[14px]" style={{ color: "var(--warning)" }}>
          {ai.url} is not answering{ai.error ? ` — ${ai.error}` : ""}.
        </p>
      ) : !ai.modelAvailable ? (
        <p className="text-[14px]" style={{ color: "var(--warning)" }}>
          Answering, but {ai.model} is not pulled. Run{" "}
          <code className="font-mono text-[13px]">ollama pull {ai.model}</code>.
          {ai.models.length > 0 ? ` It holds ${ai.models.join(", ")}.` : ""}
        </p>
      ) : (
        <p className="text-[14px] text-muted-foreground">
          {ai.model} is loaded and answering at {ai.url}.
        </p>
      )}

      {/* Nothing reads the model yet — this exists so the connection can be
          proved before Gmail or the news ranking is built on top of it. */}
      <AiTest disabled={!ai.configured} />
    </Panel>
  );
}
