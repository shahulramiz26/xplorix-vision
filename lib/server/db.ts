import { Pool, type PoolClient } from 'pg'

/* ==========================================================================
 * THE DATABASE
 *
 * Plain Postgres. On Vercel the connection string comes from the Supabase
 * integration (POSTGRES_URL); anywhere else from DATABASE_URL. With neither
 * set there is no server data, and the app runs as the browser demo.
 *
 * The app creates its own tables the first time it is used, so there
 * is no separate set-up step to run against the database.
 * ========================================================================== */

export function dbUrl() {
  const direct = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL
  if (direct) return direct
  // The integration can be connected with a prefix of your choosing
  // (MYDB_POSTGRES_URL). Take the pooled address whatever it was called.
  const key = Object.keys(process.env).find(k => /_POSTGRES_URL$/.test(k) && !!process.env[k])
    ?? Object.keys(process.env).find(k => /_POSTGRES_PRISMA_URL$/.test(k) && !!process.env[k])
  return key ? process.env[key]! : ''
}
export const hasDb = () => !!dbUrl()

const g = globalThis as unknown as { __xpPool?: Pool; __xpReady?: Promise<void> }

export function db(): Pool {
  if (!g.__xpPool) {
    const url = new URL(dbUrl())
    const local = ['localhost', '127.0.0.1'].includes(url.hostname)
    // The pooler's certificate chain is not one Node trusts by default, so the
    // connection is encrypted without checking the chain. The sslmode in the
    // string would otherwise make the driver refuse to connect.
    url.searchParams.delete('sslmode')
    url.searchParams.delete('supa')
    url.searchParams.delete('pgbouncer')
    g.__xpPool = new Pool({
      connectionString: url.toString(),
      ssl: local ? undefined : { rejectUnauthorized: false },
      max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000,
    })
  }
  return g.__xpPool
}

const SCHEMA = `
create table if not exists xp_companies (
  id text primary key,
  name text not null,
  demo boolean not null default true,
  seeded boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists xp_accounts (
  id text primary key,
  company_id text not null references xp_companies(id),
  username text not null,
  password_hash text not null,
  role text not null,
  user_ref text,
  name text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists xp_accounts_username on xp_accounts (lower(username));
create sequence if not exists xp_rev;
create table if not exists xp_records (
  company_id text not null,
  store text not null,
  coll text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  rev bigint not null,
  created_rev bigint not null,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (company_id, store, coll, id)
);
create index if not exists xp_records_rev on xp_records (company_id, rev);
alter table xp_companies add column if not exists code text;
create unique index if not exists xp_companies_code on xp_companies (upper(code));
update xp_companies set code = 'APX' where id = 'c1' and code is null;
create table if not exists xp_attempts (
  key text primary key,
  fails int not null default 0,
  blocked_until timestamptz
);
`

export function ensureSchema(): Promise<void> {
  if (!g.__xpReady) {
    g.__xpReady = db().query(SCHEMA).then(() => undefined).catch(e => { g.__xpReady = undefined; throw e })
  }
  return g.__xpReady
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await db().connect()
  try {
    await c.query('begin')
    const out = await fn(c)
    await c.query('commit')
    return out
  } catch (e) {
    await c.query('rollback').catch(() => undefined)
    throw e
  } finally {
    c.release()
  }
}
