import { randomUUID } from 'node:crypto'

export function requestId(req, res, next) {
  req.requestId = `req_${randomUUID()}`
  res.setHeader('X-Request-ID', req.requestId)
  next()
}
