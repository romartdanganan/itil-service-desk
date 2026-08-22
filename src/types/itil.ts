// Domain rules for how we run Incident Management.
//
// These are deliberately kept OUT of prisma/schema.prisma. The schema
// defines what shape an Incident record has; this file defines how the
// business decides on that shape's values (which Priority a ticket gets,
// how fast we've promised to respond to it). Business rules change more
// often than database structure, and keeping them separate means we never
// have to write a migration just because the SLA policy changed.

// Importing from "/client" (the full Prisma Client entry point) instead
// of "/enums" here would drag Node-only code — and eventually the native
// SQLite binding — into any browser bundle that imports this file, since
// this file is imported by a Client Component (RoleSwitcher). "/enums" is
// just plain `{ KEY: 'VALUE' }` objects with zero dependencies, so it's
// safe on both the server and in the browser.
import {
  Impact,
  Urgency,
  Priority,
  Role,
  IncidentCategory,
} from "../../app/generated/prisma/enums";

/**
 * ITIL Priority Matrix.
 *
 * ITIL defines Priority as a function of two independent questions asked
 * about an incident:
 *   - Impact:  how much of the business does this affect? (one person's
 *              broken mouse vs. the whole payroll system being down)
 *   - Urgency: how quickly does it need fixing? (a typo in a report you
 *              read next month vs. the card payment terminal down mid-sale)
 *
 * A high-impact, low-urgency issue and a low-impact, high-urgency issue are
 * NOT the same priority, which is why we can't just pick one field — we
 * look both up in this matrix.
 */
export const PRIORITY_MATRIX: Record<Impact, Record<Urgency, Priority>> = {
  HIGH: {
    HIGH: Priority.P1_CRITICAL,
    MEDIUM: Priority.P2_HIGH,
    LOW: Priority.P3_MEDIUM,
  },
  MEDIUM: {
    HIGH: Priority.P2_HIGH,
    MEDIUM: Priority.P3_MEDIUM,
    LOW: Priority.P4_LOW,
  },
  LOW: {
    HIGH: Priority.P3_MEDIUM,
    MEDIUM: Priority.P4_LOW,
    LOW: Priority.P4_LOW,
  },
};

export function derivePriority(impact: Impact, urgency: Urgency): Priority {
  return PRIORITY_MATRIX[impact][urgency];
}

/**
 * SLA (Service Level Agreement) targets per priority, in minutes.
 *
 * `responseMinutes` — how long an agent has to make first contact/pick up
 * the ticket after it's raised.
 * `resolveMinutes` — how long the whole incident has to be fixed.
 *
 * A P1 gets tight targets because it's hurting the business right now; a
 * P4 can wait. These numbers are what a "SLA breach" is measured against.
 */
export const SLA_POLICY_MINUTES: Record<
  Priority,
  { responseMinutes: number; resolveMinutes: number }
> = {
  P1_CRITICAL: { responseMinutes: 15, resolveMinutes: 4 * 60 },
  P2_HIGH: { responseMinutes: 30, resolveMinutes: 8 * 60 },
  P3_MEDIUM: { responseMinutes: 4 * 60, resolveMinutes: 24 * 60 },
  P4_LOW: { responseMinutes: 8 * 60, resolveMinutes: 72 * 60 },
};

export function calculateSlaDueDates(
  priority: Priority,
  from: Date = new Date(),
): { slaResponseDueAt: Date; slaResolveDueAt: Date } {
  const policy = SLA_POLICY_MINUTES[priority];
  return {
    slaResponseDueAt: new Date(
      from.getTime() + policy.responseMinutes * 60_000,
    ),
    slaResolveDueAt: new Date(from.getTime() + policy.resolveMinutes * 60_000),
  };
}

/**
 * Support tiers, in escalation order. A ticket an L1 agent can't resolve
 * (out of their skill/access level) gets escalated to the next tier up —
 * it does not go back to the customer.
 */
export const SUPPORT_TIERS: Role[] = [Role.AGENT_L1, Role.AGENT_L2, Role.AGENT_L3];

export const ROLE_LABELS: Record<Role, string> = {
  CUSTOMER: "Customer",
  AGENT_L1: "L1 Agent — Service Desk",
  AGENT_L2: "L2 Agent — Technical Support",
  AGENT_L3: "L3 Agent — Specialist / Engineering",
  MANAGER: "Service Desk Manager",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  P1_CRITICAL: "P1 — Critical",
  P2_HIGH: "P2 — High",
  P3_MEDIUM: "P3 — Medium",
  P4_LOW: "P4 — Low",
};

export const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  HARDWARE: "Hardware",
  SOFTWARE: "Software",
  NETWORK: "Network",
  ACCESS: "Access / Permissions",
  ACCOUNT: "Account",
  OTHER: "Other",
};

export const IMPACT_LABELS: Record<Impact, string> = {
  HIGH: "High — affects many people or a critical system",
  MEDIUM: "Medium — affects a team or a non-critical system",
  LOW: "Low — affects one person, workaround exists",
};

export const URGENCY_LABELS: Record<Urgency, string> = {
  HIGH: "High — needs fixing now",
  MEDIUM: "Medium — needs fixing today",
  LOW: "Low — can wait",
};

export function isAgentRole(role: Role): boolean {
  return (SUPPORT_TIERS as Role[]).includes(role) || role === Role.MANAGER;
}

/**
 * ITIL escalation: a ticket a support tier can't resolve moves UP to the
 * next tier, never back down to the requester. `currentRole` is the role
 * of whoever the ticket is assigned to right now (or `null` if unassigned,
 * which counts as "not yet escalated past L1").
 *
 * Returns the next tier's Role, or `null` if there's nowhere left to
 * escalate to (already at the top tier, L3).
 */
export function getNextTier(currentRole: Role | null): Role | null {
  if (currentRole === null || currentRole === Role.CUSTOMER || currentRole === Role.MANAGER) {
    return SUPPORT_TIERS[0];
  }
  const index = SUPPORT_TIERS.indexOf(currentRole);
  if (index === -1 || index === SUPPORT_TIERS.length - 1) {
    return null;
  }
  return SUPPORT_TIERS[index + 1];
}
