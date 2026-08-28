const express = require('express');

const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/api/v1/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'Bar 185 API' });
});

app.listen(PORT, () => {
  console.log(`Bar 185 API running on http://localhost:${PORT}`);
});
