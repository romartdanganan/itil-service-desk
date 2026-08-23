import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveUser } from "@/src/lib/session";
import { SignupForm } from "@/src/components/signup-form";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const activeUser = await getActiveUser();
  if (activeUser) {
    redirect("/");
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-lg flex-col gap-6 py-16 px-6">
        <div>
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
            Create a customer account
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Self-registration creates a customer account, for reporting
            incidents. Agent and manager accounts are provisioned
            internally, not self-service — see the{" "}
            <Link href="/login" className="underline">
              demo sign-in
            </Link>{" "}
            options if you want to explore those roles.
          </p>
        </div>

        <SignupForm />
      </main>
    </div>
  );
}
