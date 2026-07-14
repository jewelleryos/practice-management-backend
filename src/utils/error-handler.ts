import { Context } from 'hono'
import { ZodError } from 'zod'
import { JsonWebTokenError, TokenExpiredError, NotBeforeError } from 'jsonwebtoken'
import { errorResponse } from './response'
import { HTTP_STATUS } from '../config/constants'
import { AppError } from './app-error'

const errorHandler = (error: any, c: Context) => {
  // Log error in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Error occurred:', {
      path: c.req.path,
      method: c.req.method,
      message: error.message,
      stack: error.stack,
      time: new Date().toISOString(),
    })
  }

  // Zod validation errors
  if (error instanceof ZodError) {
    const errors = error.issues.map((issue) => {
      const path = issue.path.join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    })

    return errorResponse(c, 'Validation failed', errors.join(', '), HTTP_STATUS.BAD_REQUEST)
  }

  // Custom application errors
  if (error instanceof AppError) {
    return errorResponse(c, error.message, error.details, error.statusCode)
  }

  // JWT errors
  if (error instanceof TokenExpiredError) {
    return errorResponse(
      c,
      'Token has expired',
      'The provided token has expired. Please request a new one.',
      HTTP_STATUS.BAD_REQUEST
    )
  }

  if (error instanceof JsonWebTokenError) {
    return errorResponse(
      c,
      'Invalid token',
      'The provided token is invalid or malformed.',
      HTTP_STATUS.UNAUTHORIZED
    )
  }

  if (error instanceof NotBeforeError) {
    return errorResponse(
      c,
      'Token not yet valid',
      'The provided token is not yet valid. Please try again later.',
      HTTP_STATUS.UNAUTHORIZED
    )
  }

  // PostgreSQL errors
  if (error.code) {
    // Unique constraint violation
    if (error.code === '23505') {
      return errorResponse(
        c,
        'Resource already exists',
        error.detail || 'Duplicate entry',
        HTTP_STATUS.CONFLICT
      )
    }

    // Foreign key constraint violation
    if (error.code === '23503') {
      return errorResponse(
        c,
        'Invalid reference',
        error.detail || 'Referenced resource not found',
        HTTP_STATUS.BAD_REQUEST
      )
    }

    // Not null constraint violation
    if (error.code === '23502') {
      return errorResponse(
        c,
        'Required field missing',
        error.column || 'Required field is null',
        HTTP_STATUS.BAD_REQUEST
      )
    }
  }

  // Generic 500
  return errorResponse(
    c,
    error.message || 'An unexpected error occurred',
    undefined,
    HTTP_STATUS.INTERNAL_SERVER_ERROR
  )
}

export { errorHandler }
