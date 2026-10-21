import { createHmac } from 'node:crypto';

export function createOtpLimits(db, secret, now = Date.now) {
  db.exec('CREATE TABLE IF NOT EXISTS otp_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)');
  const key = text => createHmac('sha256', secret || 'sms-disabled').update(text).digest('hex');
  return entries => {
    const stamp = now();
    db.prepare('DELETE FROM otp_limits WHERE expires<=?').run(stamp);
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const [raw, maximum, duration] of entries) {
        const id = key(raw);
        const row = db.prepare('SELECT * FROM otp_limits WHERE key=?').get(id);
        if (row && row.count >= maximum) {
          const error = Object.assign(Error('محاولات كثيرة. انتظر قبل إعادة المحاولة.'), { status: 429, retryAfter: Math.ceil((row.expires - stamp) / 1000) });
          throw error;
        }
        db.prepare('INSERT INTO otp_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(id, stamp + duration);
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
}
