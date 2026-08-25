import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { quickDemoLogin } from "@/src/actions/auth";
import { DEMO_PASSWORD } from "@/src/lib/demo-accounts";
import { LoginForm } from "@/src/components/login-form";
import { ROLE_LABELS } from "@/src/types/itil";
import { Role } from "@/app/generated/prisma/client";

export const dynamic = "force-dynamic";

// Fixed display order for the demo personas — CUSTOMER first (the role
// most visitors will want to try first), then up the support tiers, then
// MANAGER. Prisma has no built-in way to sort by an arbitrary enum order,
// so this is just sorted in JS after the fetch.
const DEMO_ROLE_ORDER: Role[] = [
  Role.CUSTOMER,
  Role.AGENT_L1,
  Role.AGENT_L2,
  Role.AGENT_L3,
  Role.MANAGER,
];

export default async function LoginPage() {
  const activeUser = await getActiveUser();
  if (activeUser) {
    redirect("/");
  }

  const demoAccounts = await prisma.user.findMany({ where: { isDemoAccount: true } });
  demoAccounts.sort(
    (a, b) => DEMO_ROLE_ORDER.indexOf(a.role) - DEMO_ROLE_ORDER.indexOf(b.role),
  );

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-lg flex-col gap-8 py-16 px-6">
        <div>
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Sign in</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            New here?{" "}
            <Link href="/signup" className="underline">
              Create a customer account
            </Link>
            .
          </p>
        </div>

        <LoginForm />

        <div className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
          <div>
            <p className="text-sm font-semibold text-black dark:text-zinc-50">
              Quick demo sign-in
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              This is a portfolio demo — every account below uses the same
              password (<code>{DEMO_PASSWORD}</code>) and is safe to sign
              into. Pick a role to explore the app as that person. Anything
              you log or generate stays private to your own browser, other
              visitors trying the same demo accounts won&apos;t see it, and
              you won&apos;t see theirs.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {demoAccounts.map((account) => (
              <form key={account.id} action={quickDemoLogin}>
                <input type="hidden" name="email" value={account.email} />
                <input type="hidden" name="password" value={DEMO_PASSWORD} />
                <button
                  type="submit"
                  className="flex w-full items-center justify-between rounded-lg border border-black/10 px-3 py-2 text-left text-sm hover:border-black/20 dark:border-white/10 dark:hover:border-white/20"
                >
                  <span className="font-medium text-black dark:text-zinc-50">
                    {account.name}
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {ROLE_LABELS[account.role]}
                  </span>
                </button>
              </form>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
