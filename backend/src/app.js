import express from 'express'
import cors from 'cors'
import { env } from './config/env.js'
import { requestId } from './middleware/requestId.js'
import { notFound } from './middleware/notFound.js'
import { errorHandler } from './middleware/errorHandler.js'
import apiRoutes from './routes/index.js'

const app = express()

app.use(requestId)
app.use(cors({ origin: env.frontendOrigin }))
app.use(express.json())

app.use('/api/v1', apiRoutes)

app.use(notFound)
app.use(errorHandler)

export default app
