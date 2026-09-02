export function notFound(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource could not be found.',
      requestId: req.requestId,
      details: [],
    },
  })
}
