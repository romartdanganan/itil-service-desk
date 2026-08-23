import { prisma } from "@/src/lib/prisma";

/**
 * Builds a `notification.create` Prisma operation — it does NOT execute
 * anything itself. Every call site in incident-workflow.ts uses the
 * array-of-operations `$transaction([...])` style (not the callback
 * style), so a notification has to be handed back as one more operation
 * in that same array, atomic with the ticket update and activity row it
 * describes, rather than fired off separately after the fact.
 */
export function buildNotification({
  recipientId,
  incidentId,
  subject,
  body,
}: {
  recipientId: string;
  incidentId?: string;
  subject: string;
  body: string;
}) {
  return prisma.notification.create({
    data: { recipientId, incidentId, subject, body },
  });
}
