import jwt, { SignOptions } from 'jsonwebtoken'

export function generateToken(
  payload: object,
  secret: string,
  expiresIn: string | number
): string {
  return jwt.sign(payload, secret, { expiresIn } as SignOptions)
}

export function verifyToken<T = any>(token: string, secret: string): T {
  return jwt.verify(token, secret) as T
}

export function decodeToken<T = any>(token: string): T | null {
  return jwt.decode(token) as T | null
}
