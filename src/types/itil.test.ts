import { describe, it, expect } from "vitest";
import {
  derivePriority,
  calculateSlaDueDates,
  getNextTier,
  isAgentRole,
  getSlaRisk,
  SLA_POLICY_MINUTES,
} from "./itil";
import { Impact, Urgency, Priority, Role } from "../../app/generated/prisma/enums";

// These tests cover the pure business-rule functions in itil.ts — the
// ITIL policy itself, deliberately kept separate from anything touching
// the database or the UI (see the comment at the top of itil.ts). That
// separation is what makes this file testable with zero setup: no
// database, no server, no mocking — just inputs and expected outputs.

describe("derivePriority", () => {
  // The full 3x3 Impact x Urgency matrix, spelled out — this is the exact
  // table a service desk policy document would show, so the test doubles
  // as documentation of the actual business rule.
  const cases: [Impact, Urgency, Priority][] = [
    [Impact.HIGH, Urgency.HIGH, Priority.P1_CRITICAL],
    [Impact.HIGH, Urgency.MEDIUM, Priority.P2_HIGH],
    [Impact.HIGH, Urgency.LOW, Priority.P3_MEDIUM],
    [Impact.MEDIUM, Urgency.HIGH, Priority.P2_HIGH],
    [Impact.MEDIUM, Urgency.MEDIUM, Priority.P3_MEDIUM],
    [Impact.MEDIUM, Urgency.LOW, Priority.P4_LOW],
    [Impact.LOW, Urgency.HIGH, Priority.P3_MEDIUM],
    [Impact.LOW, Urgency.MEDIUM, Priority.P4_LOW],
    [Impact.LOW, Urgency.LOW, Priority.P4_LOW],
  ];

  it.each(cases)("Impact=%s, Urgency=%s -> %s", (impact, urgency, expected) => {
    expect(derivePriority(impact, urgency)).toBe(expected);
  });

  it("depends on both axes — neither one alone determines the result", () => {
    // Fix Impact=HIGH, vary Urgency: the result changes.
    expect(derivePriority(Impact.HIGH, Urgency.HIGH)).toBe(Priority.P1_CRITICAL);
    expect(derivePriority(Impact.HIGH, Urgency.LOW)).toBe(Priority.P3_MEDIUM);
    // Fix Urgency=HIGH, vary Impact: the result also changes. If Priority
    // only tracked one field, one of these pairs would collide.
    expect(derivePriority(Impact.LOW, Urgency.HIGH)).toBe(Priority.P3_MEDIUM);
    expect(derivePriority(Impact.HIGH, Urgency.HIGH)).not.toBe(
      derivePriority(Impact.LOW, Urgency.HIGH),
    );
  });
});

describe("calculateSlaDueDates", () => {
  const from = new Date("2026-01-01T00:00:00.000Z");

  it.each(Object.values(Priority))("uses the correct response/resolve window for %s", (priority) => {
    const policy = SLA_POLICY_MINUTES[priority];
    const { slaResponseDueAt, slaResolveDueAt } = calculateSlaDueDates(priority, from);

    expect(slaResponseDueAt.getTime() - from.getTime()).toBe(policy.responseMinutes * 60_000);
    expect(slaResolveDueAt.getTime() - from.getTime()).toBe(policy.resolveMinutes * 60_000);
  });

  it("gives tighter deadlines to higher priorities", () => {
    const p1 = calculateSlaDueDates(Priority.P1_CRITICAL, from);
    const p4 = calculateSlaDueDates(Priority.P4_LOW, from);
    expect(p1.slaResolveDueAt.getTime()).toBeLessThan(p4.slaResolveDueAt.getTime());
    expect(p1.slaResponseDueAt.getTime()).toBeLessThan(p4.slaResponseDueAt.getTime());
  });

  it("defaults `from` to now when not provided", () => {
    const before = Date.now();
    const { slaResponseDueAt } = calculateSlaDueDates(Priority.P1_CRITICAL);
    const after = Date.now();
    const responseMinutes = SLA_POLICY_MINUTES[Priority.P1_CRITICAL].responseMinutes;
    expect(slaResponseDueAt.getTime()).toBeGreaterThanOrEqual(before + responseMinutes * 60_000);
    expect(slaResponseDueAt.getTime()).toBeLessThanOrEqual(after + responseMinutes * 60_000);
  });
});

describe("getNextTier", () => {
  it("escalates up the chain, one tier at a time", () => {
    expect(getNextTier(Role.AGENT_L1)).toBe(Role.AGENT_L2);
    expect(getNextTier(Role.AGENT_L2)).toBe(Role.AGENT_L3);
  });

  it("has nowhere to escalate past L3", () => {
    expect(getNextTier(Role.AGENT_L3)).toBeNull();
  });

  it("routes a brand-new ticket (no assignee yet) to L1", () => {
    expect(getNextTier(null)).toBe(Role.AGENT_L1);
  });

  it("treats CUSTOMER and MANAGER as 'not yet escalated' -> L1", () => {
    // Neither role is a fix-it tier, so if a ticket somehow needs
    // escalating from one of these, the only sensible destination is the
    // first real support tier.
    expect(getNextTier(Role.CUSTOMER)).toBe(Role.AGENT_L1);
    expect(getNextTier(Role.MANAGER)).toBe(Role.AGENT_L1);
  });

  it("never sends a ticket back down a tier or to the customer", () => {
    for (const role of [Role.AGENT_L1, Role.AGENT_L2, Role.AGENT_L3]) {
      const next = getNextTier(role);
      expect(next).not.toBe(Role.CUSTOMER);
    }
  });
});

describe("isAgentRole", () => {
  it("is true for every support tier and the manager", () => {
    expect(isAgentRole(Role.AGENT_L1)).toBe(true);
    expect(isAgentRole(Role.AGENT_L2)).toBe(true);
    expect(isAgentRole(Role.AGENT_L3)).toBe(true);
    expect(isAgentRole(Role.MANAGER)).toBe(true);
  });

  it("is false for a customer", () => {
    expect(isAgentRole(Role.CUSTOMER)).toBe(false);
  });
});

describe("getSlaRisk", () => {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");

  function riskAt(windowMinutes: number, elapsedMinutes: number) {
    const slaResolveDueAt = new Date(createdAt.getTime() + windowMinutes * 60_000);
    const now = new Date(createdAt.getTime() + elapsedMinutes * 60_000);
    return getSlaRisk({ createdAt, slaResolveDueAt }, now);
  }

  it("is ON_TRACK well within the window", () => {
    // P1-sized window (240 min), 180 min left (75% remaining)
    expect(riskAt(240, 60)).toBe("ON_TRACK");
  });

  it("is AT_RISK in the last 20% of the window, regardless of priority", () => {
    // P1-sized window (240 min): 10 min left = ~4% remaining
    expect(riskAt(240, 230)).toBe("AT_RISK");
    // P4-sized window (4320 min): 30 min left is nowhere near 20%, but is
    // still deep in the danger zone — proportional math, not raw minutes.
    expect(riskAt(4320, 4290)).toBe("AT_RISK");
  });

  it("treats exactly 20% remaining as AT_RISK (inclusive boundary)", () => {
    expect(riskAt(240, 192)).toBe("AT_RISK"); // 48 of 240 min left = exactly 20%
  });

  it("treats just over 20% remaining as ON_TRACK", () => {
    expect(riskAt(240, 191)).toBe("ON_TRACK"); // 49 of 240 min left ≈ 20.4%
  });

  it("is BREACHED once the deadline has passed", () => {
    expect(riskAt(240, 241)).toBe("BREACHED");
  });
});
