export {}

// Hash a plaintext password with bcrypt (cost 12) — the same scheme the auth
// service verifies against. Use it to generate the hash that goes into a seed
// migration, or to reset a member's password by hand.
//
//   bun run src/scripts/hash-password.ts '<password>'

const password = process.argv[2]

if (!password) {
  console.error("Usage: bun run src/scripts/hash-password.ts '<password>'")
  process.exit(1)
}

const hash = await Bun.password.hash(password, {
  algorithm: 'bcrypt',
  cost: 12,
})

console.log('Password:', password)
console.log('Hash:    ', hash)
