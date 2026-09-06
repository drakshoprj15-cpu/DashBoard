import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

async function audit(sql: Sql) {
  const [summary] = await sql`
    with paid as (
      select
        c.workspace_id,
        lower(trim(c.email)) as email,
        c.marketing_opt_out,
        c.is_blocked
      from customers c
      join workspaces w
        on w.id = c.workspace_id
       and w.slug = 'infinity-principal'
      where c.deleted_at is null
        and coalesce(c.tags, '[]'::jsonb)
          @> '["__infinity_import_status:paid"]'::jsonb
    )
    select
      count(*)::int as paid_total,
      count(*) filter (where p.marketing_opt_out)::int as opted_out,
      count(*) filter (where p.is_blocked)::int as blocked,
      count(*) filter (where s.email is not null)::int as suppressed,
      count(*) filter (
        where not p.marketing_opt_out
          and not p.is_blocked
          and s.email is null
      )::int as eligible
    from paid p
    left join email_suppressions s
      on s.workspace_id = p.workspace_id
     and lower(trim(s.email)) = p.email
     and s.reason <> 'transient_bounce'
  `;
  return summary;
}

async function repair(sql: Sql) {
  return sql.begin(async (tx) => {
    const transientSuppressionsReleased = await tx`
      update email_suppressions s
      set
        reason = 'transient_bounce',
        updated_at = now()
      from workspaces w, customers c
      where w.id = s.workspace_id
        and w.slug = 'infinity-principal'
        and c.workspace_id = s.workspace_id
        and lower(trim(c.email)) = lower(trim(s.email))
        and c.deleted_at is null
        and coalesce(c.tags, '[]'::jsonb)
          @> '["__infinity_import_status:paid"]'::jsonb
        and s.reason = 'bounce'
        and exists (
          select 1
          from email_recipients transient_recipient
          join email_events transient_event
            on transient_event.recipient_id = transient_recipient.id
           and transient_event.workspace_id = transient_recipient.workspace_id
          where transient_recipient.workspace_id = s.workspace_id
            and lower(trim(transient_recipient.email)) = lower(trim(s.email))
            and transient_event.type = 'bounced'
            and lower(
              coalesce(transient_event.metadata -> 'bounce' ->> 'type', '')
            ) = 'transient'
        )
        and not exists (
          select 1
          from email_recipients permanent_recipient
          join email_events permanent_event
            on permanent_event.recipient_id = permanent_recipient.id
           and permanent_event.workspace_id = permanent_recipient.workspace_id
          where permanent_recipient.workspace_id = s.workspace_id
            and lower(trim(permanent_recipient.email)) = lower(trim(s.email))
            and permanent_event.type = 'bounced'
            and lower(
              coalesce(permanent_event.metadata -> 'bounce' ->> 'type', '')
            ) = 'permanent'
        )
      returning s.id
    `;

    return {
      transientSuppressionsReleased: transientSuppressionsReleased.length,
    };
  });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL ausente");

  const sql = postgres(databaseUrl, { prepare: false });
  try {
    const before = await audit(sql);
    if (!process.argv.includes("--apply")) {
      console.log(
        JSON.stringify(
          {
            mode: "dry-run",
            before,
            next: "Execute novamente com --apply para aplicar a correção.",
          },
          null,
          2,
        ),
      );
      return;
    }

    const changes = await repair(sql);
    const after = await audit(sql);
    console.log(
      JSON.stringify({ mode: "applied", before, changes, after }, null, 2),
    );
  } finally {
    await sql.end();
  }
}

void main();
