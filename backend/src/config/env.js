import dotenv from 'dotenv'

dotenv.config()

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}

export const env = {
  port: Number(process.env.PORT || 3000),
  frontendOrigin:
    process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL,
}