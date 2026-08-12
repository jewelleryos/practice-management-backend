export {}

// Migration runner — applies every pending SQL file in src/migrations, in order,
// exactly once. Safe to run repeatedly: already-applied files are skipped.
//
//   bun run migrate            (or)   bun run src/scripts/migrate.ts
//
// How it works:
//   - A bookkeeping table `schema_migrations` records which files have run.
//   - Files in src/migrations are sorted by their numeric prefix (001, 002, …).
//   - Each pending file runs inside its OWN transaction: if it fails, that file
//     is rolled back and the runner stops with a non-zero exit code (so a broken
//     migration never leaves the DB half-applied, and Docker/CI sees the failure).
//
// It talks to the database named in DATABASE_URL — the same var the app uses.
// This is the one script that legitimately runs SQL against the DB; it is meant
// to be wired into the Docker/deploy step so there is never a "pending migration".

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Client } from 'pg'

const MIGRATIONS_DIR = join(import.meta.dir, '..', 'migrations')

if (!process.env.DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set. Point it at the target database and retry.')
  process.exit(1)
}

const client = new Client({ connectionString: process.env.DATABASE_URL })

try {
  await client.connect()

  // Bookkeeping table — tracks which migration files have already been applied.
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const appliedResult = await client.query<{ filename: string }>(
    'SELECT filename FROM schema_migrations'
  )
  const applied = new Set(appliedResult.rows.map((r) => r.filename))

  // Numeric prefixes are zero-padded to 3 digits, so a plain lexical sort is
  // already in run order (001, 002, … 047).
  const allFiles = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const pending = allFiles.filter((f) => !applied.has(f))

  if (pending.length === 0) {
    console.log(`✓ Database is up to date — ${applied.size} migration(s) already applied, 0 pending.`)
    await client.end()
    process.exit(0)
  }

  console.log(`Found ${pending.length} pending migration(s). Applying…`)

  for (const file of pending) {
    const sql = await Bun.file(join(MIGRATIONS_DIR, file)).text()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`  ✓ ${file}`)
    } catch (err) {
      await client.query('ROLLBACK')
      console.error(`  ✗ ${file} failed — rolled back. No further migrations run.`)
      console.error(err instanceof Error ? err.message : err)
      await client.end()
      process.exit(1)
    }
  }

  console.log(`✓ Done. Applied ${pending.length} migration(s).`)
  await client.end()
  process.exit(0)
} catch (err) {
  console.error('✗ Migration runner failed to start:')
  console.error(err instanceof Error ? err.message : err)
  await client.end().catch(() => {})
  process.exit(1)
}
