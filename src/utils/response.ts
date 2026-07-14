import { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { HTTP_STATUS } from '../config/constants'

interface SuccessResponse<T = any> {
  success: true
  message: string
  data: T
}

interface ErrorResponse {
  success: false
  message: string
  error?: any
}

export function successResponse<T = any>(
  c: Context,
  message: string,
  data: T,
  statusCode: ContentfulStatusCode = HTTP_STATUS.OK
) {
  const response: SuccessResponse<T> = {
    success: true,
    message,
    data,
  }
  return c.json(response, statusCode)
}

export function errorResponse(
  c: Context,
  message: string,
  error?: any,
  statusCode: ContentfulStatusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR
) {
  const response: ErrorResponse = {
    success: false,
    message,
  }

  if (error !== undefined && error !== null) {
    response.error = error
  }

  return c.json(response, statusCode)
}
