import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  isAuthorizedWebsiteSession,
  isWebsiteProtectionEnabled,
  WEBSITE_AUTH_COOKIE,
} from "@/lib/auth";

function readSearchParam(
  value: string | string[] | undefined,
  fallback: string,
) {
  return typeof value === "string" ? value : fallback;
}

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const [query, cookieStore] = await Promise.all([searchParams, cookies()]);
  const nextPath = readSearchParam(query.next, "/");
  const error = readSearchParam(query.error, "");
  const isProtected = isWebsiteProtectionEnabled();

  if (!isProtected) {
    redirect("/");
  }

  const hasSession = isAuthorizedWebsiteSession(
    cookieStore.get(WEBSITE_AUTH_COOKIE)?.value,
  );

  if (hasSession) {
    redirect(nextPath);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f5ecdd_0%,#efe3ce_45%,#eadcc4_100%)] px-6 py-10">
      <div className="mx-auto flex min-h-[80vh] max-w-4xl items-center justify-center">
        <section className="w-full max-w-xl rounded-[1.75rem] border border-[#241c13]/10 bg-[#fbf6ed]/95 px-7 py-8 shadow-[0_28px_80px_rgba(36,28,19,0.12)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#ae7a1a]">
            Protected access
          </div>
          <h1 className="font-display mt-3 text-[3rem] leading-[1.02] text-[#241c13]">
            Enter the site password
          </h1>
          <p className="mt-4 text-[16px] leading-8 text-[#241c13]/72">
            This website is privately gated. Enter the password to access the
            study dashboard.
          </p>

          <form
            action="/api/auth/login"
            method="post"
            className="mt-8 space-y-5"
          >
            <input type="hidden" name="next" value={nextPath} />

            <div>
              <label
                htmlFor="password"
                className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#241c13]/55"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoFocus
                className="mt-3 w-full rounded-[1rem] border border-[#241c13]/15 bg-white px-4 py-3 text-[16px] text-[#241c13] outline-none transition focus:border-[#ae7a1a]"
              />
            </div>

            {error === "invalid-password" ? (
              <div className="rounded-[1rem] border border-[#c9533e]/25 bg-[#f3d9d1]/45 px-4 py-3 text-sm leading-6 text-[#7a2e1c]">
                The password was incorrect.
              </div>
            ) : null}

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-full bg-[#241c13] px-6 py-3 font-display text-base text-[#f8f2e8] shadow-[0_12px_28px_rgba(36,28,19,0.18)] transition hover:bg-[#ae7a1a]"
            >
              Enter website
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
