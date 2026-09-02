import { Router } from 'express'
import { pool } from '../db/pool.js'

const router = Router()

router.get('/health', (req, res) => {
  res.status(200).json({
    data: {
      status: 'ok',
      service: 'Bar 185 API',
    },
    requestId: req.requestId,
  })
})

router.get('/db-health', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT NOW() AS database_time')

    res.status(200).json({
      data: {
        status: 'ok',
        database: 'connected',
        databaseTime: result.rows[0].database_time,
      },
      requestId: req.requestId,
    })
  } catch (error) {
    next(error)
  }
})

export default router