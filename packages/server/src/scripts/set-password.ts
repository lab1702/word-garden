#!/usr/bin/env node
import bcrypt from 'bcrypt';
import pg from 'pg';

const [username, password] = process.argv.slice(2);

if (!username || !password) {
  console.error('Usage: tsx scripts/set-password.ts <username> <password>');
  process.exit(1);
}

if (password.length < 8 || password.length > 72) {
  console.error('Password must be between 8 and 72 characters');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://wordgarden:wordgarden_dev@localhost:5432/wordgarden',
});

try {
  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    'UPDATE users SET password_hash = $1 WHERE username = $2 RETURNING id, username',
    [hash, username],
  );

  if (result.rowCount === 0) {
    console.error(`User "${username}" not found`);
    process.exit(1);
  }

  console.log(`Password updated for ${result.rows[0].username}`);
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
} finally {
  await pool.end();
}
