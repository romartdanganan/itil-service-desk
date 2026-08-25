import { redirect } from "next/navigation";
import { getActiveUser } from "@/src/lib/session";
import { createServiceRequest } from "@/src/actions/service-requests";
import { CATEGORY_LABELS } from "@/src/types/itil";
import { IncidentCategory } from "@/app/generated/prisma/client";
import { SERVICE_REQUEST_CATALOG } from "@/src/data/service-request-catalog";

export const dynamic = "force-dynamic";

export default async function NewServiceRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ catalog?: string }>;
}) {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }

  const { catalog } = await searchParams;
  const catalogItem = catalog
    ? SERVICE_REQUEST_CATALOG.find((item) => item.slug === catalog)
    : undefined;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 py-16 px-6">
      <div>
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
          {catalogItem ? catalogItem.title : "Log a New Service Request"}
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Requesting as {activeUser.name}.
        </p>
        <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          {catalogItem ? (
            <>
              This is a standard, named request from IT&apos;s catalog, so
              its category and approval requirement are already set below.{" "}
              {catalogItem.requestType === "STANDARD" ? (
                <>
                  It&apos;s <strong>pre-approved</strong>: it goes straight
                  to the fulfillment queue once you submit.
                </>
              ) : (
                <>
                  It <strong>needs a manager&apos;s sign-off</strong> before
                  anyone can start on it.
                </>
              )}
            </>
          ) : (
            <>
              Not one of the common requests? Describe what you need below.
              Anything outside the standard catalog needs a manager&apos;s
              sign-off first, since it isn&apos;t something IT has
              pre-approved.
            </>
          )}
        </p>
      </div>

      <form action={createServiceRequest} className="flex flex-col gap-4">
        <input
          type="hidden"
          name="requestType"
          value={catalogItem?.requestType ?? "APPROVAL_REQUIRED"}
        />
        {catalogItem && <input type="hidden" name="category" value={catalogItem.category} />}

        <div className="flex flex-col gap-1">
          <label htmlFor="title" className="text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            defaultValue={catalogItem?.title ?? ""}
            placeholder="Short summary of what you need"
            className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={4}
            defaultValue={catalogItem?.description ?? ""}
            placeholder="What exactly do you need, and why?"
            className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          />
        </div>

        {catalogItem ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Category: <strong>{CATEGORY_LABELS[catalogItem.category]}</strong> · Typical
            fulfillment: {catalogItem.typicalFulfillmentDays} day
            {catalogItem.typicalFulfillmentDays === 1 ? "" : "s"}.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            <label htmlFor="category" className="text-sm font-medium">
              Category
            </label>
            <select
              id="category"
              name="category"
              required
              defaultValue=""
              className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
            >
              <option value="" disabled>
                Select a category...
              </option>
              {Object.values(IncidentCategory).map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="submit"
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Submit Request
        </button>
      </form>
    </main>
  );
}
