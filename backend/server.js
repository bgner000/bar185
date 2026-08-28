const express = require('express');
const pool = require('./db');

const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Bar 185 API'
  });
});

app.get('/api/v1/db-health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS database_time');

    res.status(200).json({
      status: 'connected',
      database: 'PostgreSQL',
      databaseTime: result.rows[0].database_time
    });
  } catch (error) {
    console.error('Database connection error:', error.message);

    res.status(500).json({
      status: 'database connection failed'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Bar 185 API running on http://localhost:${PORT}`);
});
