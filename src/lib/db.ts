import { Pool, types } from 'pg'

// A DATE column is a calendar-only value (e.g. date of birth / incorporation).
// By default pg parses it into a local-midnight JS Date, which then serializes
// to a timezone-shifted UTC timestamp (e.g. '1972-09-08T18:30:00.000Z') and can
// drift by a day. Return it verbatim as 'YYYY-MM-DD' instead. TIMESTAMPTZ is
// left untouched so real instants keep their timezone semantics.
types.setTypeParser(types.builtins.DATE, (value) => value)

// Single shared PostgreSQL connection pool. All database access goes through this.
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 30, // pool size (default is 10)
  idleTimeoutMillis: 30000, // close idle connections after 30s
  connectionTimeoutMillis: 5000, // error if a connection takes longer than 5s
})

db.on('error', (err) => {
  console.error('Unexpected error on idle client', err)
  process.exit(-1)
})

// Verify connectivity on startup.
db.query('SELECT 1')
  .then(() => console.log('Database connected successfully'))
  .catch((err) => {
    console.error('Database connection failed', err)
    process.exit(-1)
})
