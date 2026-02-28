import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://wordgarden:wordgarden_dev@localhost:5432/wordgarden',
});

pool.on('error', (err) => {
  console.error('Unexpected pool client error:', err);
});

export default pool;
