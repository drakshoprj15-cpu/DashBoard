export const CUSTOMER_PAGE_SIZES = [20, 50, 100, 200] as const;

export const CUSTOMER_SORTS = [
  "recent",
  "oldest",
  "spent_desc",
  "spent_asc",
  "orders_desc",
  "orders_asc",
  "name_asc",
  "name_desc",
  "activity_desc",
  "approval_desc",
] as const;

export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export const CUSTOMER_TYPES = [
  "all",
  "buyer",
  "imported_paid",
  "imported_pending",
  "lead",
  "abandoned",
  "checkout",
  "recurring",
  "pending",
  "refused",
  "no_purchase",
] as const;

export type CustomerTypeFilter = (typeof CUSTOMER_TYPES)[number];

export interface CustomerListFilters {
  q: string;
  type: CustomerTypeFilter;
  orderStatus: string;
  origin: string;
  productId: string;
  landingPageId: string;
  campaignId: string;
  country: string;
  state: string;
  city: string;
  hasEmail: string;
  hasPhone: string;
  emailValid: string;
  phoneValid: string;
  acceptsCommunication: string;
  hasAbandoned: string;
  hasPending: string;
  from: string;
  to: string;
  lastOrderFrom: string;
  lastOrderTo: string;
  minOrders: number | null;
  maxOrders: number | null;
  minSpent: number | null;
  maxSpent: number | null;
  page: number;
  pageSize: number;
  sort: CustomerSort;
}

export interface CustomerStatusTag {
  key:
    | "buyer"
    | "imported_paid"
    | "imported_pending"
    | "lead"
    | "abandoned"
    | "recurring"
    | "pending"
    | "refused";
  label: string;
}

export type CustomerImportClassification = "paid" | "pending" | "contact";
export type CustomerImportedStatus = Exclude<
  CustomerImportClassification,
  "contact"
>;

export interface CustomerListRow {
  id: string;
  name: string;
  email: string;
  emailStatus: string;
  phone: string | null;
  phoneCountryCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  source: string;
  importedStatus: CustomerImportedStatus | null;
  tags: string[];
  statuses: CustomerStatusTag[];
  orderCount: number;
  paidCount: number;
  pendingCount: number;
  refusedCount: number;
  abandonedCarts: number;
  totalSpentCents: number;
  averageTicketCents: number;
  approvalRate: number;
  currency: string;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  lastActivityAt: string;
  lastActivityType: string;
  marketingOptOut: boolean;
  acceptsCommunication: boolean;
  isBlocked: boolean;
  createdAt: string;
}

export interface CustomerStats {
  totalContacts: number;
  buyers: number;
  importedPaid: number;
  importedPending: number;
  leads: number;
  abandonedCarts: number;
  recurring: number;
  pending: number;
  refused: number;
  totalSpentCents: number;
  currency: string;
}

export interface CustomerFacets {
  countries: string[];
  states: string[];
  cities: string[];
  origins: string[];
  landingPages: Array<{ id: string; name: string }>;
  campaigns: Array<{ id: string; name: string }>;
}

export interface CustomerListResponse {
  rows: CustomerListRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  stats: CustomerStats;
  facets: CustomerFacets;
}

export interface CustomerDetail extends CustomerListRow {
  documentMasked: string | null;
  address: {
    street: string | null;
    number: string | null;
    complement: string | null;
    postalCode: string | null;
  } | null;
  notes: Array<{
    id: string;
    content: string;
    createdAt: string;
    author: string | null;
  }>;
  activities: Array<{
    id: string;
    type: string;
    source: string | null;
    createdAt: string;
    description: string;
  }>;
  orders: Array<{
    id: string;
    reference: string;
    product: string;
    valueCents: number;
    currency: string;
    status: string;
    gateway: string | null;
    createdAt: string;
  }>;
  carts: Array<{
    id: string;
    status: string;
    valueCents: number;
    currency: string;
    abandonedAt: string | null;
    recoveredAt: string | null;
  }>;
  communications: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    failed: number;
    unsubscribed: number;
    campaigns: string[];
  };
}

export interface CustomerMutationResult {
  ok: boolean;
  message?: string;
  error?: string;
  customerId?: string;
  duplicateId?: string;
}
