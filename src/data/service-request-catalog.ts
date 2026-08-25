// Service Request Management's catalog: a small set of routine, named
// asks, the ITIL "service catalog" idea, each pre-classified as either
// pre-approved (STANDARD) or needing a manager's sign-off first
// (APPROVAL_REQUIRED, see ServiceRequestType in prisma/schema.prisma).
// Picking one from /requests pre-fills the new-request form via a plain
// ?catalog= query param (see app/requests/new/page.tsx), no client-side
// JavaScript involved, the same server-rendered pre-fill pattern already
// used for "raise a problem from this incident" and "raise a change from
// this problem".
import type { IncidentCategory } from "@/app/generated/prisma/enums";

export type ServiceRequestCatalogRequestType = "STANDARD" | "APPROVAL_REQUIRED";

export type ServiceRequestCatalogItem = {
  slug: string;
  title: string;
  description: string;
  category: IncidentCategory;
  requestType: ServiceRequestCatalogRequestType;
  typicalFulfillmentDays: number;
};

export const SERVICE_REQUEST_CATALOG: ServiceRequestCatalogItem[] = [
  {
    slug: "password-reset",
    title: "Password reset",
    description: "I'm locked out of my account and need my password reset.",
    category: "ACCOUNT",
    requestType: "STANDARD",
    typicalFulfillmentDays: 1,
  },
  {
    slug: "vpn-access",
    title: "VPN access setup",
    description: "I need VPN access set up so I can connect from outside the office.",
    category: "ACCESS",
    requestType: "STANDARD",
    typicalFulfillmentDays: 1,
  },
  {
    slug: "software-install",
    title: "Software installation",
    description: "Please install the following approved software on my machine: ",
    category: "SOFTWARE",
    requestType: "STANDARD",
    typicalFulfillmentDays: 2,
  },
  {
    slug: "software-license",
    title: "Software license renewal",
    description: "My license for the following software is expiring and needs renewing: ",
    category: "SOFTWARE",
    requestType: "STANDARD",
    typicalFulfillmentDays: 3,
  },
  {
    slug: "shared-drive-access",
    title: "Access to a shared drive or folder",
    description: "I need access to the following shared drive or folder: ",
    category: "ACCESS",
    requestType: "APPROVAL_REQUIRED",
    typicalFulfillmentDays: 2,
  },
  {
    slug: "new-laptop",
    title: "New starter laptop",
    description: "A new starter needs a laptop set up before their start date.",
    category: "HARDWARE",
    requestType: "APPROVAL_REQUIRED",
    typicalFulfillmentDays: 5,
  },
  {
    slug: "extra-monitor",
    title: "Additional monitor",
    description: "I'd like an additional monitor set up at my desk.",
    category: "HARDWARE",
    requestType: "APPROVAL_REQUIRED",
    typicalFulfillmentDays: 5,
  },
  {
    slug: "mobile-device",
    title: "Mobile phone or tablet",
    description: "I need a company mobile phone or tablet issued to me.",
    category: "HARDWARE",
    requestType: "APPROVAL_REQUIRED",
    typicalFulfillmentDays: 5,
  },
];
