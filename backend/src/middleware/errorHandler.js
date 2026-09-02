export function errorHandler(err, req, res, next) {
  console.error(`[${req.requestId}]`, err)

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected server failure occurred.',
      requestId: req.requestId,
      details: [],
    },
  })
}
