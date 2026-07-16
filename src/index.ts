import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import './lib/db'
import { authRoutes } from './modules/auth/routes/auth.routes'
import { roleRoutes } from './modules/roles/routes/roles.routes'
import { firmRoutes } from './modules/firms/routes/firms.routes'
import { memberRoutes } from './modules/members/routes/members.routes'
import { financialYearRoutes } from './modules/financial-years/routes/financial-years.routes'
import { serviceRoutes } from './modules/services/routes/services.routes'
import { serviceChecklistRoutes } from './modules/service-checklists/routes/service-checklists.routes'
import { entityTypeRoutes } from './modules/entity-types/routes/entity-types.routes'
import { clientGroupRoutes } from './modules/client-groups/routes/client-groups.routes'
import { softwareRoutes } from './modules/software/routes/software.routes'
import { relationTypeRoutes } from './modules/relation-types/routes/relation-types.routes'
import { noteTypeRoutes } from './modules/note-types/routes/note-types.routes'
import { workStatusRoutes } from './modules/work-statuses/routes/work-statuses.routes'
import { loanTypeRoutes } from './modules/loan-types/routes/loan-types.routes'
import { taxClientRoutes } from './modules/tax-clients/routes/tax-clients.routes'
import { taxTaskRoutes } from './modules/tax-tasks/routes/tax-tasks.routes'
import { taxPersonalTaskRoutes } from './modules/tax-personal-tasks/routes/tax-personal-tasks.routes'
import type { AppEnv } from './types/hono.types'

const app = new Hono<AppEnv>()

// Middleware
app.use('*', logger())
app.use(
  '*',
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
)

// Prevent browser/CDN from caching API responses
app.use('/api/*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate')
  c.header('Pragma', 'no-cache')
  c.header('Expires', '0')
})

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.get('/', (c) => c.json({ message: 'Practice Management API' }))

// Routes
app.route('/api/auth', authRoutes)
app.route('/api/roles', roleRoutes)
app.route('/api/firms', firmRoutes)
app.route('/api/members', memberRoutes)
app.route('/api/financial-years', financialYearRoutes)
app.route('/api/services', serviceRoutes)
app.route('/api/service-checklists', serviceChecklistRoutes)

// Department-scoped: Tax Practice clients (firm-scoped visibility)
app.route('/api/tax-clients', taxClientRoutes)
// Department-scoped: Tax Practice tasks (firm + assigned-scoped visibility)
app.route('/api/tax-tasks', taxTaskRoutes)
app.route('/api/tax-personal-tasks', taxPersonalTaskRoutes)

// Master data (name + description lookups)
app.route('/api/entity-types', entityTypeRoutes)
app.route('/api/client-groups', clientGroupRoutes)
app.route('/api/software', softwareRoutes)
app.route('/api/relation-types', relationTypeRoutes)
app.route('/api/note-types', noteTypeRoutes)
app.route('/api/work-statuses', workStatusRoutes)
app.route('/api/loan-types', loanTypeRoutes)

// Server configuration
const port = Number(process.env.PORT) || 8787
const host = process.env.HOST || '0.0.0.0'
const env = process.env.NODE_ENV || 'development'

console.log(`[${env}] Server running at http://${host}:${port}`)

export default {
  port,
  hostname: host,
  fetch: app.fetch,
}
