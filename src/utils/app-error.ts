import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class AppError extends Error {
  public statusCode: ContentfulStatusCode
  public details?: any

  constructor(message: string, statusCode: ContentfulStatusCode = 400, details?: any) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.details = details
    Error.captureStackTrace(this, this.constructor)
  }
}
