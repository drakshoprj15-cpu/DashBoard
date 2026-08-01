// Aplica um arquivo de migration avulso.
//
// Por que existe: a tabela `drizzle.__drizzle_migrations` do banco só tem a
// migration 0000 registrada, embora 0001–0006 já estejam aplicadas. Nesse
// estado, `drizzle-kit migrate` tenta reaplicar tudo desde a 0001 e aborta.
// Este script executa apenas o arquivo indicado, statement a statement.
//
//   node scripts/apply-migration.mjs src/database/migrations/0007_tired_sugar_man.sql
//
// Carrega as credenciais do ambiente (DIRECT_URL ou DATABASE_URL). Em local,
// exporte-as a partir do .env.local antes de rodar.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const file = process.argv[2];
if (!file) {
  console.error("uso: node scripts/apply-migration.mjs <arquivo.sql>");
  process.exit(1);
}

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("defina DIRECT_URL ou DATABASE_URL");
  process.exit(1);
}

const statements = readFileSync(file, "utf8")
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

let applied = 0;
let skipped = 0;

for (const statement of statements) {
  try {
    await sql.unsafe(statement);
    applied += 1;
    console.log("OK   " + statement.slice(0, 90).replace(/\s+/g, " "));
  } catch (error) {
    // 42701 coluna já existe · 42710 constraint já existe · 42P07 tabela já existe
    if (["42701", "42710", "42P07"].includes(error.code)) {
      skipped += 1;
      console.log("SKIP " + statement.slice(0, 90).replace(/\s+/g, " "));
      continue;
    }
    console.error("FALHOU:", statement);
    console.error(error.message);
    await sql.end();
    process.exit(1);
  }
}

console.log(`\n${applied} aplicados, ${skipped} já existiam.`);
await sql.end();
