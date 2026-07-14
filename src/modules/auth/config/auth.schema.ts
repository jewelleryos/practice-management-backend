import { z } from 'zod'

export const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .transform((val) => val.toLowerCase()),
  password: z.string().min(1, 'Password is required'),
})
