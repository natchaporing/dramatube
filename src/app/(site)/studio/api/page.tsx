import { headers } from "next/headers";
import { revokeTokenAction } from "@/app/actions/studio";
import { TokenForm } from "@/components/studio/token-form";
import { env } from "@/lib/env";
import { formatDate, timeAgo } from "@/lib/format";
import { listTokens } from "@/lib/tokens";
import { pageContext } from "@/lib/viewer";

export const metadata = { title: "API" };

export default async function StudioApiPage() {
  const { user, t, locale } = await pageContext();
  if (!user) return null;
  const tokens = await listTokens(user.id);
  const head = await headers();
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "localhost:3000";
  const origin = env.publicAppUrl ?? `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"}://${host}`;

  const example = `# 1. Send the file
curl -X POST ${origin}/api/v1/uploads \\
  -H "Authorization: Bearer $DRAMATUBE_TOKEN" \\
  -H "Content-Type: video/mp4" \\
  --data-binary @episode-01.mp4
# → { "uploadId": "upl_…" }

# 2. Publish it
curl -X POST ${origin}/api/v1/videos \\
  -H "Authorization: Bearer $DRAMATUBE_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "uploadId": "upl_…",
    "title": "The Salt Line — Episode 1",
    "visibility": "public",
    "category": "drama",
    "aiUsage": "generated",
    "aiModels": ["Veo", "ElevenLabs"],
    "sourceApp": "DramaStudio"
  }'
# → { "id": "…", "url": "${origin}/watch/…" }`;

  return (
    <div className="max-w-3xl space-y-8">
      <section>
        <h1 className="text-xl font-bold text-text">{t("studio.apiTitle")}</h1>
        <p className="mb-5 mt-1 text-sm text-muted">{t("studio.apiIntro")}</p>
        <TokenForm />
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-text">{t("studio.tokens")}</h2>
        {tokens.length === 0 ? (
          <p className="text-sm text-muted">{t("studio.noTokens")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {tokens.map((token) => (
              <li key={token.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-text">{token.name}</div>
                  <div className="font-mono text-xs text-muted">
                    {token.prefix}… · {formatDate(token.createdAt, locale)} ·{" "}
                    {token.lastUsedAt ? t("studio.lastUsed", { when: timeAgo(token.lastUsedAt, locale) }) : t("studio.neverUsed")}
                  </div>
                </div>
                <form action={revokeTokenAction}>
                  <input type="hidden" name="tokenId" value={token.id} />
                  <button className="btn btn-danger h-8 text-xs">{t("studio.revoke")}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-text">{t("studio.apiExample")}</h2>
        <pre className="overflow-x-auto rounded-xl bg-surface p-4 font-mono text-xs leading-relaxed text-muted">{example}</pre>
      </section>
    </div>
  );
}
