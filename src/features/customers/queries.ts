import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/database/client";
import {
  carts,
  customerActivities,
  customerNotes,
  orderItems,
  orders,
  profiles,
} from "@/database/schema";
import { requireCustomerPermission } from "@/features/customers/access";
import {
  activityLabel,
  buildCustomerStatuses,
  maskDocument,
  maskPhone,
} from "@/features/customers/customer-utils";
import type {
  CustomerDetail,
  CustomerFacets,
  CustomerListFilters,
  CustomerListResponse,
  CustomerListRow,
  CustomerStats,
} from "@/features/customers/types";

type RawRow = Record<string, unknown>;

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isoValue(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string");
  return [];
}

function optionArray(value: unknown): Array<{ id: string; name: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    return typeof candidate.id === "string" &&
      typeof candidate.name === "string"
      ? [{ id: candidate.id, name: candidate.name }]
      : [];
  });
}

function customerBaseCte(workspaceId: string) {
  return sql`
    with order_stats as (
      select
        o.customer_id,
        count(*)::int as order_count,
        count(*) filter (where o.status in ('paid','preparing','shipped','delivered'))::int as paid_count,
        count(*) filter (where o.status in ('created','awaiting_payment','processing'))::int as pending_count,
        count(*) filter (where o.status in ('refused','expired'))::int as refused_count,
        min(o.created_at) as first_order_at,
        max(o.created_at) as last_order_at,
        (array_agg(o.currency order by o.created_at desc))[1] as currency
      from orders o
      where o.workspace_id = ${workspaceId}
      group by o.customer_id
    ),
    approved_payments as (
      select o.customer_id, coalesce(sum(p.amount_cents), 0)::bigint as approved_cents
      from payments p
      join orders o on o.id = p.order_id and o.workspace_id = ${workspaceId}
      where p.approved_at is not null
         or p.status in ('approved','partially_refunded','refunded','chargeback')
      group by o.customer_id
    ),
    refunded_payments as (
      select o.customer_id, coalesce(sum(r.amount_cents), 0)::bigint as refunded_cents
      from refunds r
      join orders o on o.id = r.order_id and o.workspace_id = ${workspaceId}
      where r.status = 'completed'
      group by o.customer_id
    ),
    disputed_payments as (
      select o.customer_id, coalesce(sum(cb.amount_cents), 0)::bigint as chargeback_cents
      from chargebacks cb
      join orders o on o.id = cb.order_id and o.workspace_id = ${workspaceId}
      where cb.status in ('open','lost')
      group by o.customer_id
    ),
    cart_stats as (
      select
        ca.customer_id,
        count(*) filter (where ca.status = 'abandoned')::int as abandoned_carts,
        max(ca.last_activity_at) as cart_last_activity
      from carts ca
      where ca.workspace_id = ${workspaceId}
      group by ca.customer_id
    ),
    tag_stats as (
      select cta.customer_id, jsonb_agg(ct.name order by ct.name) as assigned_tags
      from customer_tag_assignments cta
      join customer_tags ct on ct.id = cta.tag_id and ct.workspace_id = ${workspaceId}
      where cta.workspace_id = ${workspaceId}
      group by cta.customer_id
    ),
    base as (
      select
        c.id,
        c.first_name,
        c.last_name,
        c.email,
        c.email_status,
        c.phone,
        c.normalized_phone,
        c.phone_country_code,
        c.country,
        c.source,
        c.first_landing_page_id,
        c.last_landing_page_id,
        c.tags as legacy_tags,
        coalesce(ts.assigned_tags, '[]'::jsonb) as assigned_tags,
        c.marketing_opt_out,
        c.accepts_email,
        c.accepts_sms,
        c.accepts_whatsapp,
        c.is_blocked,
        c.document,
        c.created_at,
        c.first_seen_at,
        greatest(
          coalesce(c.last_activity_at, c.created_at),
          coalesce(os.last_order_at, c.created_at),
          coalesce(cs.cart_last_activity, c.created_at)
        ) as last_activity_at,
        a.city,
        a.state,
        a.street,
        a.number,
        a.complement,
        a.postal_code,
        coalesce(os.order_count, 0)::int as order_count,
        coalesce(os.paid_count, 0)::int as paid_count,
        coalesce(os.pending_count, 0)::int as pending_count,
        coalesce(os.refused_count, 0)::int as refused_count,
        coalesce(cs.abandoned_carts, 0)::int as abandoned_carts,
        os.first_order_at,
        os.last_order_at,
        coalesce(os.currency, 'BRL') as currency,
        greatest(
          0,
          coalesce(ap.approved_cents, 0) -
          coalesce(rp.refunded_cents, 0) -
          coalesce(dp.chargeback_cents, 0)
        )::bigint as total_spent_cents
      from customers c
      left join order_stats os on os.customer_id = c.id
      left join approved_payments ap on ap.customer_id = c.id
      left join refunded_payments rp on rp.customer_id = c.id
      left join disputed_payments dp on dp.customer_id = c.id
      left join cart_stats cs on cs.customer_id = c.id
      left join tag_stats ts on ts.customer_id = c.id
      left join lateral (
        select ca.city, ca.state, ca.street, ca.number, ca.complement, ca.postal_code
        from customer_addresses ca
        where ca.customer_id = c.id and ca.workspace_id = ${workspaceId}
        order by ca.is_default desc, ca.updated_at desc
        limit 1
      ) a on true
      where c.workspace_id = ${workspaceId} and c.deleted_at is null
    )
  `;
}

function filteredWhere(filters: CustomerListFilters) {
  const conditions = [sql`true`];
  if (filters.q) {
    const like = `%${filters.q}%`;
    const phone = filters.q.replace(/\D/g, "");
    conditions.push(sql`(
      lower(coalesce(b.first_name, '') || ' ' || coalesce(b.last_name, '')) like lower(${like})
      or lower(b.email) like lower(${like})
      or coalesce(b.phone, '') ilike ${like}
      or coalesce(b.document, '') ilike ${like}
      or exists (
        select 1 from orders so
        where so.customer_id = b.id and so.reference ilike ${like}
      )
      ${phone ? sql`or coalesce(b.normalized_phone, '') like ${`%${phone}%`} or b.document = ${phone}` : sql``}
    )`);
  }
  if (filters.type === "buyer") conditions.push(sql`b.paid_count > 0`);
  if (filters.type === "lead") conditions.push(sql`b.paid_count = 0`);
  if (filters.type === "abandoned") conditions.push(sql`b.abandoned_carts > 0`);
  if (filters.type === "checkout")
    conditions.push(
      sql`exists (select 1 from carts tc where tc.customer_id = b.id)`,
    );
  if (filters.type === "recurring") conditions.push(sql`b.paid_count >= 2`);
  if (filters.type === "pending") conditions.push(sql`b.pending_count > 0`);
  if (filters.type === "refused") conditions.push(sql`b.refused_count > 0`);
  if (filters.type === "no_purchase") conditions.push(sql`b.paid_count = 0`);
  if (filters.orderStatus)
    conditions.push(sql`exists (
      select 1 from orders fo where fo.customer_id = b.id and fo.status::text = ${filters.orderStatus}
    )`);
  if (filters.origin) conditions.push(sql`b.source = ${filters.origin}`);
  if (filters.productId)
    conditions.push(sql`exists (
      select 1 from orders po
      join order_items poi on poi.order_id = po.id
      where po.customer_id = b.id and poi.product_id = ${filters.productId}
    )`);
  if (filters.landingPageId)
    conditions.push(sql`(
      b.first_landing_page_id = ${filters.landingPageId}::uuid
      or b.last_landing_page_id = ${filters.landingPageId}::uuid
      or exists (
        select 1 from orders lo
        where lo.customer_id = b.id and lo.utm ->> 'lp' = ${filters.landingPageId}
      )
    )`);
  if (filters.campaignId)
    conditions.push(sql`exists (
      select 1 from orders co
      where co.customer_id = b.id and (
        co.campaign_id = ${filters.campaignId}::uuid
        or co.utm ->> 'campaign' = ${filters.campaignId}
      )
    )`);
  if (filters.country) conditions.push(sql`b.country = ${filters.country}`);
  if (filters.state) conditions.push(sql`b.state = ${filters.state}`);
  if (filters.city) conditions.push(sql`b.city = ${filters.city}`);
  if (filters.hasEmail) conditions.push(sql`length(trim(b.email)) > 0`);
  if (filters.hasPhone)
    conditions.push(sql`length(trim(coalesce(b.phone, ''))) > 0`);
  if (filters.emailValid) conditions.push(sql`b.email_status = 'valid'`);
  if (filters.phoneValid)
    conditions.push(
      sql`length(coalesce(b.normalized_phone, '')) between 8 and 16`,
    );
  if (filters.acceptsCommunication)
    conditions.push(sql`(
      (b.accepts_email or b.accepts_sms or b.accepts_whatsapp)
      and not b.marketing_opt_out and not b.is_blocked
    )`);
  if (filters.hasAbandoned) conditions.push(sql`b.abandoned_carts > 0`);
  if (filters.hasPending) conditions.push(sql`b.pending_count > 0`);
  if (filters.from) conditions.push(sql`b.created_at >= ${filters.from}::date`);
  if (filters.to)
    conditions.push(
      sql`b.created_at < (${filters.to}::date + interval '1 day')`,
    );
  if (filters.lastOrderFrom)
    conditions.push(sql`b.last_order_at >= ${filters.lastOrderFrom}::date`);
  if (filters.lastOrderTo)
    conditions.push(
      sql`b.last_order_at < (${filters.lastOrderTo}::date + interval '1 day')`,
    );
  if (filters.minOrders != null)
    conditions.push(sql`b.order_count >= ${filters.minOrders}`);
  if (filters.maxOrders != null)
    conditions.push(sql`b.order_count <= ${filters.maxOrders}`);
  if (filters.minSpent != null)
    conditions.push(sql`b.total_spent_cents >= ${filters.minSpent}`);
  if (filters.maxSpent != null)
    conditions.push(sql`b.total_spent_cents <= ${filters.maxSpent}`);
  return sql.join(conditions, sql` and `);
}

function orderBy(sort: CustomerListFilters["sort"]) {
  const values = {
    recent: sql`b.created_at desc`,
    oldest: sql`b.created_at asc`,
    spent_desc: sql`b.total_spent_cents desc, b.last_activity_at desc`,
    spent_asc: sql`b.total_spent_cents asc, b.last_activity_at desc`,
    orders_desc: sql`b.order_count desc, b.last_activity_at desc`,
    orders_asc: sql`b.order_count asc, b.last_activity_at desc`,
    name_asc: sql`coalesce(b.first_name, ''), coalesce(b.last_name, '') asc`,
    name_desc: sql`coalesce(b.first_name, '') desc, coalesce(b.last_name, '') desc`,
    activity_desc: sql`b.last_activity_at desc`,
    approval_desc: sql`(b.paid_count::numeric / greatest(b.order_count, 1)) desc, b.paid_count desc`,
  } satisfies Record<CustomerListFilters["sort"], ReturnType<typeof sql>>;
  return values[sort];
}

function mapRow(row: RawRow, canViewSensitiveData = true): CustomerListRow {
  const paidCount = numberValue(row.paid_count);
  const orderCount = numberValue(row.order_count);
  const pendingCount = numberValue(row.pending_count);
  const refusedCount = numberValue(row.refused_count);
  const abandonedCarts = numberValue(row.abandoned_carts);
  const totalSpentCents = numberValue(row.total_spent_cents);
  const firstName = stringValue(row.first_name);
  const lastName = stringValue(row.last_name);
  const email = stringValue(row.email);
  const lastActivityAt =
    isoValue(row.last_activity_at) ?? new Date(0).toISOString();
  const lastOrderAt = isoValue(row.last_order_at);
  const cartIsLatest =
    abandonedCarts > 0 &&
    (!lastOrderAt || new Date(lastActivityAt) > new Date(lastOrderAt));

  return {
    id: stringValue(row.id),
    name: [firstName, lastName].filter(Boolean).join(" ") || email,
    email,
    emailStatus: stringValue(row.email_status, "unknown"),
    phone: canViewSensitiveData
      ? nullableString(row.phone)
      : maskPhone(nullableString(row.phone)),
    phoneCountryCode: nullableString(row.phone_country_code),
    city: nullableString(row.city),
    state: nullableString(row.state),
    country: nullableString(row.country),
    source: stringValue(row.source, "unknown"),
    tags: Array.from(
      new Set([
        ...stringArray(row.legacy_tags),
        ...stringArray(row.assigned_tags),
      ]),
    ),
    statuses: buildCustomerStatuses({
      paidCount,
      pendingCount,
      refusedCount,
      abandonedCarts,
    }),
    orderCount,
    paidCount,
    pendingCount,
    refusedCount,
    abandonedCarts,
    totalSpentCents,
    averageTicketCents:
      paidCount > 0 ? Math.round(totalSpentCents / paidCount) : 0,
    approvalRate: orderCount > 0 ? paidCount / orderCount : 0,
    currency: stringValue(row.currency, "BRL"),
    firstOrderAt: isoValue(row.first_order_at),
    lastOrderAt,
    lastActivityAt,
    lastActivityType: cartIsLatest
      ? "cart_abandoned"
      : paidCount > 0
        ? "payment_approved"
        : orderCount > 0
          ? "order_created"
          : "customer_created",
    marketingOptOut: Boolean(row.marketing_opt_out),
    acceptsCommunication:
      (Boolean(row.accepts_email) ||
        Boolean(row.accepts_sms) ||
        Boolean(row.accepts_whatsapp)) &&
      !Boolean(row.marketing_opt_out) &&
      !Boolean(row.is_blocked),
    isBlocked: Boolean(row.is_blocked),
    createdAt: isoValue(row.created_at) ?? new Date(0).toISOString(),
  };
}

export async function listCustomers(
  filters: CustomerListFilters,
): Promise<CustomerListResponse> {
  const { workspaceId, canViewSensitiveData } =
    await requireCustomerPermission("view");
  const db = getDb();
  const base = customerBaseCte(workspaceId);
  const where = filteredWhere(filters);
  const offset = (filters.page - 1) * filters.pageSize;

  const [rowsResult, countResult, statsResult, facetsResult] =
    await Promise.all([
      db.execute(sql`${base}
      select b.* from base b
      where ${where}
      order by ${orderBy(filters.sort)}
      limit ${filters.pageSize} offset ${offset}
    `),
      db.execute(sql`${base}
      select count(*)::int as total from base b where ${where}
    `),
      db.execute(sql`${base}
      select
        count(*)::int as total_contacts,
        count(*) filter (where b.paid_count > 0)::int as buyers,
        count(*) filter (where b.paid_count = 0)::int as leads,
        count(*) filter (where b.abandoned_carts > 0)::int as abandoned_carts,
        count(*) filter (where b.paid_count >= 2)::int as recurring,
        count(*) filter (where b.pending_count > 0)::int as pending,
        count(*) filter (where b.refused_count > 0)::int as refused,
        coalesce(sum(b.total_spent_cents), 0)::bigint as total_spent_cents,
        coalesce((array_agg(b.currency order by b.paid_count desc))[1], 'BRL') as currency
      from base b
    `),
      db.execute(sql`${base}
      select
        coalesce(jsonb_agg(distinct b.country) filter (where b.country is not null), '[]'::jsonb) as countries,
        coalesce(jsonb_agg(distinct b.state) filter (where b.state is not null), '[]'::jsonb) as states,
        coalesce(jsonb_agg(distinct b.city) filter (where b.city is not null), '[]'::jsonb) as cities,
        coalesce(jsonb_agg(distinct b.source) filter (where b.source is not null), '[]'::jsonb) as origins,
        coalesce((
          select jsonb_agg(jsonb_build_object('id', lp.id, 'name', lp.name) order by lp.name)
          from landing_pages lp
          where lp.workspace_id = ${workspaceId} and lp.deleted_at is null
        ), '[]'::jsonb) as landing_pages,
        coalesce((
          select jsonb_agg(jsonb_build_object('id', cp.id, 'name', cp.name) order by cp.name)
          from campaigns cp
          where cp.workspace_id = ${workspaceId}
        ), '[]'::jsonb) as campaigns
      from base b
    `),
    ]);

  const rawRows = rowsResult as unknown as RawRow[];
  const countRow = (countResult as unknown as RawRow[])[0] ?? {};
  const statsRow = (statsResult as unknown as RawRow[])[0] ?? {};
  const facetsRow = (facetsResult as unknown as RawRow[])[0] ?? {};
  const total = numberValue(countRow.total);
  const stats: CustomerStats = {
    totalContacts: numberValue(statsRow.total_contacts),
    buyers: numberValue(statsRow.buyers),
    leads: numberValue(statsRow.leads),
    abandonedCarts: numberValue(statsRow.abandoned_carts),
    recurring: numberValue(statsRow.recurring),
    pending: numberValue(statsRow.pending),
    refused: numberValue(statsRow.refused),
    totalSpentCents: numberValue(statsRow.total_spent_cents),
    currency: stringValue(statsRow.currency, "BRL"),
  };
  const facets: CustomerFacets = {
    countries: stringArray(facetsRow.countries).sort(),
    states: stringArray(facetsRow.states).sort(),
    cities: stringArray(facetsRow.cities).sort(),
    origins: stringArray(facetsRow.origins).sort(),
    landingPages: optionArray(facetsRow.landing_pages),
    campaigns: optionArray(facetsRow.campaigns),
  };

  return {
    rows: rawRows.map((row) => mapRow(row, canViewSensitiveData)),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    pageCount: Math.max(1, Math.ceil(total / filters.pageSize)),
    stats,
    facets,
  };
}

export async function listCustomersForExport(
  filters: CustomerListFilters,
  customerIds?: string[],
): Promise<CustomerListRow[]> {
  const { workspaceId, canViewSensitiveData } =
    await requireCustomerPermission("export");
  const db = getDb();
  const base = customerBaseCte(workspaceId);
  const where = filteredWhere(filters);
  const ids = customerIds
    ? Array.from(new Set(customerIds)).slice(0, 10_000)
    : [];
  const selectedWhere =
    ids.length > 0 ? sql`and b.id = any(${ids}::uuid[])` : sql``;
  const result = await db.execute(sql`${base}
    select b.* from base b
    where ${where} ${selectedWhere}
    order by ${orderBy(filters.sort)}
    limit 10000
  `);
  return (result as unknown as RawRow[]).map((row) =>
    mapRow(row, canViewSensitiveData),
  );
}

export async function getCustomerDetail(
  id: string,
): Promise<CustomerDetail | null> {
  const access = await requireCustomerPermission("view");
  const db = getDb();
  const base = customerBaseCte(access.workspaceId);
  const result = await db.execute(
    sql`${base} select b.* from base b where b.id = ${id} limit 1`,
  );
  const raw = (result as unknown as RawRow[])[0];
  if (!raw) return null;
  const row = mapRow(raw, access.canViewSensitiveData);

  const [orderRows, cartRows, noteRows, activityRows, communicationResult] =
    await Promise.all([
      db
        .select({
          id: orders.id,
          reference: orders.reference,
          valueCents: orders.totalCents,
          currency: orders.currency,
          status: orders.status,
          createdAt: orders.createdAt,
          product: sql<string>`coalesce(string_agg(distinct ${orderItems.productName}, ', '), 'Sem produto')`,
        })
        .from(orders)
        .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
        .where(
          and(
            eq(orders.workspaceId, access.workspaceId),
            eq(orders.customerId, id),
          ),
        )
        .groupBy(orders.id)
        .orderBy(desc(orders.createdAt))
        .limit(50),
      db
        .select({
          id: carts.id,
          status: carts.status,
          valueCents: carts.totalCents,
          currency: carts.currency,
          abandonedAt: carts.abandonedAt,
          recoveredAt: carts.recoveredAt,
          createdAt: carts.createdAt,
        })
        .from(carts)
        .where(
          and(
            eq(carts.workspaceId, access.workspaceId),
            eq(carts.customerId, id),
          ),
        )
        .orderBy(desc(carts.createdAt))
        .limit(50),
      db
        .select({
          id: customerNotes.id,
          content: customerNotes.content,
          createdAt: customerNotes.createdAt,
          author: profiles.name,
        })
        .from(customerNotes)
        .leftJoin(profiles, eq(profiles.id, customerNotes.createdBy))
        .where(
          and(
            eq(customerNotes.workspaceId, access.workspaceId),
            eq(customerNotes.customerId, id),
          ),
        )
        .orderBy(desc(customerNotes.createdAt))
        .limit(50),
      db
        .select({
          id: customerActivities.id,
          type: customerActivities.type,
          source: customerActivities.source,
          createdAt: customerActivities.createdAt,
        })
        .from(customerActivities)
        .where(
          and(
            eq(customerActivities.workspaceId, access.workspaceId),
            eq(customerActivities.customerId, id),
          ),
        )
        .orderBy(desc(customerActivities.createdAt))
        .limit(100),
      db.execute(sql`
      select
        count(distinct er.id)::int as sent,
        count(distinct er.id) filter (where ee.type = 'delivered')::int as delivered,
        count(distinct er.id) filter (where ee.type = 'opened')::int as opened,
        count(distinct er.id) filter (where ee.type = 'clicked')::int as clicked,
        count(distinct er.id) filter (where ee.type in ('failed','bounced','complained'))::int as failed,
        count(distinct er.id) filter (where ee.type = 'unsubscribed')::int as unsubscribed,
        coalesce(jsonb_agg(distinct ec.name) filter (where ec.name is not null), '[]'::jsonb) as campaigns
      from email_recipients er
      left join email_events ee on ee.recipient_id = er.id and ee.workspace_id = ${access.workspaceId}
      left join email_campaigns ec on ec.id = er.campaign_id and ec.workspace_id = ${access.workspaceId}
      where er.workspace_id = ${access.workspaceId} and er.customer_id = ${id}
    `),
    ]);

  const communicationRow =
    (communicationResult as unknown as RawRow[])[0] ?? {};

  const derivedActivities = [
    ...orderRows.map((order) => ({
      id: `order-${order.id}`,
      type: ["paid", "preparing", "shipped", "delivered"].includes(order.status)
        ? "payment_approved"
        : order.status === "refused"
          ? "payment_refused"
          : "order_created",
      source: "order",
      createdAt: order.createdAt.toISOString(),
      description: `${order.reference} · ${order.product}`,
    })),
    ...cartRows.map((cart) => ({
      id: `cart-${cart.id}`,
      type: cart.status === "abandoned" ? "cart_abandoned" : "checkout_started",
      source: "cart",
      createdAt: (cart.abandonedAt ?? cart.createdAt).toISOString(),
      description: activityLabel(
        cart.status === "abandoned" ? "cart_abandoned" : "checkout_started",
      ),
    })),
    ...activityRows.map((activity) => ({
      id: activity.id,
      type: activity.type,
      source: activity.source,
      createdAt: activity.createdAt.toISOString(),
      description: activityLabel(activity.type),
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);

  return {
    ...row,
    documentMasked: access.canViewSensitiveData
      ? maskDocument(nullableString(raw.document))
      : nullableString(raw.document)
        ? "•••.•••.•••-••"
        : null,
    address:
      access.canViewSensitiveData && (raw.street || raw.postal_code)
        ? {
            street: nullableString(raw.street),
            number: nullableString(raw.number),
            complement: nullableString(raw.complement),
            postalCode: nullableString(raw.postal_code),
          }
        : null,
    notes: noteRows.map((note) => ({
      ...note,
      createdAt: note.createdAt.toISOString(),
    })),
    activities: derivedActivities,
    orders: orderRows.map((order) => ({
      id: order.id,
      reference: order.reference,
      product: order.product,
      valueCents: order.valueCents,
      currency: order.currency,
      status: order.status,
      gateway: null,
      createdAt: order.createdAt.toISOString(),
    })),
    carts: cartRows.map((cart) => ({
      id: cart.id,
      status: cart.status,
      valueCents: cart.valueCents,
      currency: cart.currency,
      abandonedAt: cart.abandonedAt?.toISOString() ?? null,
      recoveredAt: cart.recoveredAt?.toISOString() ?? null,
    })),
    communications: {
      sent: numberValue(communicationRow.sent),
      delivered: numberValue(communicationRow.delivered),
      opened: numberValue(communicationRow.opened),
      clicked: numberValue(communicationRow.clicked),
      failed: numberValue(communicationRow.failed),
      unsubscribed: numberValue(communicationRow.unsubscribed),
      campaigns: stringArray(communicationRow.campaigns),
    },
  };
}
