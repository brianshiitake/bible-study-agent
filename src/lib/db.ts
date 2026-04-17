import postgres from "postgres";
import { getEnv } from "@/lib/env";

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

function getConnectionString() {
  const connectionString = getEnv().SUPABASE_CONNECTION_STRING;

  return connectionString ? normalizeConnectionString(connectionString) : undefined;
}

export function hasDatabaseConnection() {
  return Boolean(getConnectionString());
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
