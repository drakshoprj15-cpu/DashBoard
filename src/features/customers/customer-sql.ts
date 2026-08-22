import "server-only";

import { sql } from "drizzle-orm";

import { customers } from "@/database/schema";

/**
 * Legacy imports may predate the normalized identity columns. These
 * expressions keep duplicate detection reliable without rewriting records.
 */
export const storedNormalizedCustomerEmail = sql<string>`
  coalesce(${customers.normalizedEmail}, lower(trim(${customers.email})))
`;

export const storedNormalizedCustomerPhone = sql<string | null>`
  coalesce(
    ${customers.normalizedPhone},
    nullif(regexp_replace(coalesce(${customers.phone}, ''), '[^0-9]', '', 'g'), '')
  )
`;
