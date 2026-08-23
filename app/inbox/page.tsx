import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";

export const dynamic = "force-dynamic";

// The simulated inbox — see the Notification model comment in
// schema.prisma for why this exists at all (no real email is ever sent;
// this is what makes "you've got mail" moments from the ITIL workflow —
// assigned a ticket, your ticket got resolved — actually visible).
export default async function InboxPage() {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }

  const notifications = await prisma.notification.findMany({
    where: { recipientId: activeUser.id },
    orderBy: { createdAt: "desc" },
    include: { incident: { select: { id: true } } },
  });

  // Checking the inbox is what marks things read — same model as a real
  // email client, and simpler than wiring up per-row read/unread clicks.
  // Snapshot which ones WERE unread first so this render can still show
  // that visual distinction; a second visit will show them all as read.
  const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
  if (unreadIds.length > 0) {
    await prisma.notification.updateMany({
      where: { id: { in: unreadIds } },
      data: { read: true },
    });
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-6 py-16 px-6">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Inbox</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Simulated notifications — no real email is sent. This is what
            the service desk would have emailed {activeUser.name} in a
            real deployment.
          </p>
        </div>

        {notifications.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nothing here yet — notifications show up as tickets you're
            involved in move (assigned, escalated, resolved, commented on).
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {notifications.map((notification) => {
              const wasUnread = unreadIds.includes(notification.id);
              const row = (
                <div
                  className={`rounded-lg border p-4 text-sm transition-colors ${
                    wasUnread
                      ? "border-black/20 bg-white dark:border-white/20 dark:bg-zinc-900"
                      : "border-black/10 bg-zinc-50 dark:border-white/10 dark:bg-black"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                    <span>{notification.createdAt.toLocaleString()}</span>
                    {wasUnread && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        New
                      </span>
                    )}
                  </div>
                  <p
                    className={`mt-1 ${
                      wasUnread ? "font-semibold" : "font-medium"
                    } text-black dark:text-zinc-50`}
                  >
                    {notification.subject}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                    {notification.body}
                  </p>
                </div>
              );

              return (
                <li key={notification.id}>
                  {notification.incident ? (
                    <Link href={`/incidents/${notification.incident.id}`}>{row}</Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
