import postgres from "postgres";

let sqlClient: postgres.Sql | null = null;
let schemaReadyPromise: Promise<void> | null = null;

function normalizeConnectionString(connectionString: string) {
  try {
    return new URL(connectionString).toString();
  } catch {
    const protocolIndex = connectionString.indexOf("://");

    if (protocolIndex === -1) {
      return connectionString;
    }

    const protocol = connectionString.slice(0, protocolIndex);
    const remainder = connectionString.slice(protocolIndex + 3);
    const firstSlashIndex = remainder.indexOf("/");

    if (firstSlashIndex === -1) {
      return connectionString;
    }

    const authority = remainder.slice(0, firstSlashIndex);
    const pathAndSearch = remainder.slice(firstSlashIndex);
    const atIndex = authority.lastIndexOf("@");

    if (atIndex === -1) {
      return connectionString;
    }

    const userInfo = authority.slice(0, atIndex);
    const hostPort = authority.slice(atIndex + 1);
    const colonIndex = userInfo.indexOf(":");

    if (colonIndex === -1) {
      return connectionString;
    }

    const username = userInfo.slice(0, colonIndex);
    const password = userInfo.slice(colonIndex + 1);
    const normalizedUrl = new URL(`${protocol}://${hostPort}${pathAndSearch}`);

    normalizedUrl.username = username;
    normalizedUrl.password = password;

    return normalizedUrl.toString();
  }
}

function parseConnectionString(connectionString: string) {
  try {
    return new URL(connectionString);
  } catch {
    return null;
  }
}

function getInvalidConnectionStringMessage(connectionString: string) {
  return [
    "SUPABASE_CONNECTION_STRING is not a valid Postgres connection string.",
    "Copy the exact connection string from Supabase Connect and paste it into Vercel without editing it by hand.",
    `Received: ${connectionString}`,
  ].join(" ");
}

function getSupabaseVercelPoolerMessage(hostname: string) {
  return [
    `SUPABASE_CONNECTION_STRING points at Supabase's direct database host (${hostname}:5432), which is not supported on Vercel.`,
    "Vercel does not support Supabase's default IPv6-only direct Postgres connection.",
    "In Supabase, open Connect and copy the Transaction pooler connection string instead, then update Vercel and redeploy.",
  ].join(" ");
}

function getConnectionIssue(connectionString: string) {
  const parsed = parseConnectionString(connectionString);

  if (!parsed) {
    return getInvalidConnectionStringMessage(connectionString);
  }

  const isSupabaseDirectHost = /^db\.[^.]+\.supabase\.co$/i.test(parsed.hostname);
  const port = parsed.port || (parsed.protocol === "postgresql:" ? "5432" : "");

  if (process.env.VERCEL && isSupabaseDirectHost && port === "5432") {
    return getSupabaseVercelPoolerMessage(parsed.hostname);
  }

  return null;
}

function getConnectionString() {
  const rawConnectionString = process.env.SUPABASE_CONNECTION_STRING;

  if (!rawConnectionString) {
    return undefined;
  }

  const normalizedConnectionString = normalizeConnectionString(rawConnectionString);
  const issue = getConnectionIssue(normalizedConnectionString);

  if (issue) {
    throw new Error(issue);
  }

  return normalizedConnectionString;
}

export function getDatabaseConnectionIssue() {
  try {
    getConnectionString();
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "The database connection is not configured correctly.";
  }
}

export function hasDatabaseConnection() {
  try {
    return Boolean(getConnectionString());
  } catch {
    return false;
  }
}

export function getSql() {
  const connectionString = getConnectionString();

  if (!connectionString) {
    throw new Error(
      "SUPABASE_CONNECTION_STRING is required to persist and load study runs.",
    );
  }

  if (!sqlClient) {
    sqlClient = postgres(connectionString, {
      prepare: false,
      max: 1,
      idle_timeout: 10,
      connect_timeout: 15,
    });
  }

  return sqlClient;
}

export async function ensureDatabaseSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const sql = getSql();
      await sql`
        create table if not exists study_runs (
          id text primary key,
          slug text not null unique,
          reference text not null,
          focus_question text,
          created_at timestamptz not null,
          version_ids jsonb not null,
          final_thesis text not null,
          confidence text not null,
          result_payload jsonb not null
        )
      `;
      await sql`
        create index if not exists study_runs_created_at_idx
        on study_runs (created_at desc)
      `;
      await sql`
        create table if not exists study_passage_questions (
          id text primary key,
          study_id text not null references study_runs(id) on delete cascade,
          reference text not null,
          version_id text not null,
          selection_text text not null,
          question text not null,
          answer text not null,
          surrounding_context text not null,
          confidence text not null,
          created_at timestamptz not null
        )
      `;
      await sql`
        create unique index if not exists study_passage_questions_exact_idx
        on study_passage_questions (study_id, version_id, selection_text, question)
      `;
      await sql`
        create index if not exists study_passage_questions_created_idx
        on study_passage_questions (study_id, created_at desc)
      `;
    })();
  }

  return schemaReadyPromise;
}
