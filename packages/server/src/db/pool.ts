import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://wordgarden:wordgarden_dev@localhost:5432/wordgarden',
});

export default pool;
