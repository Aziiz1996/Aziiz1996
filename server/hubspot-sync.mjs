const EMAIL = /^[a-z0-9.!#$%&*+\/=?^_{}|~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const HUBSPOT_URL = 'https://api.hubapi.com/crm/objects/2026-09/0-1/batch/upsert';

export function createHubspotSync(db, { env = process.env, fetcher = fetch, now = Date.now } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS hubspot_sync_queue (
    user_id TEXT PRIMARY KEY,
    consented_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    synced_at TEXT,
    last_error_code TEXT
  )`);

  let running = false;
  const token = () => String(env.HUBSPOT_ACCESS_TOKEN || '').trim();
  const configured = () => token().length >= 20;
  const timestamp = () => new Date(now()).toISOString();

  function queueUser(userId) {
    const at = timestamp();
    db.prepare(`INSERT INTO hubspot_sync_queue (user_id,consented_at,status,attempts,updated_at,synced_at,last_error_code)
      VALUES (?,?,'pending',0,?,NULL,NULL)
      ON CONFLICT(user_id) DO UPDATE SET consented_at=excluded.consented_at,status='pending',attempts=0,
        updated_at=excluded.updated_at,synced_at=NULL,last_error_code=NULL`).run(userId, at, at);
  }

  function queueExistingAccounts() {
    const rows = db.prepare('SELECT id,username FROM users').all();
    const at = timestamp();
    const insert = db.prepare(`INSERT INTO hubspot_sync_queue (user_id,consented_at,status,attempts,updated_at,synced_at,last_error_code)
      VALUES (?,?,'pending',0,?,NULL,NULL)
      ON CONFLICT(user_id) DO UPDATE SET consented_at=excluded.consented_at,status='pending',attempts=0,
        updated_at=excluded.updated_at,synced_at=NULL,last_error_code=NULL`);
    let queued = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of rows) {
        const email = String(row.username || '').trim().toLowerCase();
        if (!EMAIL.test(email) || email.endsWith('.invalid')) continue;
        insert.run(row.id, at, at);
        queued++;
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    return queued;
  }

  function status() {
    const result = { configured: configured(), pending: 0, syncing: 0, synced: 0, failed: 0, skipped: 0 };
    for (const row of db.prepare('SELECT status,COUNT(*) AS count FROM hubspot_sync_queue GROUP BY status').all()) {
      if (Object.hasOwn(result, row.status)) result[row.status] = row.count;
    }
    return result;
  }

  function contact(row) {
    const email = String(row.username || '').trim().toLowerCase();
    if (!EMAIL.test(email) || email.endsWith('.invalid')) return null;
    let data = {};
    try { data = JSON.parse(row.data || '{}'); } catch { return null; }
    const profile = data.studentProfile && typeof data.studentProfile === 'object' ? data.studentProfile : {};
    const settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
    const fallback = email.slice(0, email.indexOf('@'));
    const fullName = String(profile.fullName || settings.name || fallback).trim().slice(0, 80) || fallback;
    const properties = { email, firstname: fullName };
    const phone = String(profile.phone || '').trim().slice(0, 40);
    if (phone) properties.phone = phone;
    return { userId: row.user_id, input: { id: email, idProperty: 'email', properties } };
  }

  function setRows(rows, values) {
    const update = db.prepare(`UPDATE hubspot_sync_queue SET status=?,attempts=attempts+?,updated_at=?,synced_at=?,last_error_code=? WHERE user_id=?`);
    const at = timestamp();
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of rows) update.run(values.status, values.incrementAttempts ? 1 : 0, at, values.synced ? at : null, values.errorCode || null, row.user_id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  async function processPending() {
    if (running || !configured()) return;
    running = true;
    try {
      const rows = db.prepare(`SELECT q.user_id,q.attempts,u.username,u.data
        FROM hubspot_sync_queue q JOIN users u ON u.id=q.user_id
        WHERE q.status='pending' ORDER BY q.consented_at,q.user_id LIMIT 100`).all();
      if (!rows.length) return;

      const inputs = [];
      const validRows = [];
      const skippedRows = [];
      for (const row of rows) {
        const mapped = contact(row);
        if (!mapped) { skippedRows.push(row); continue; }
        inputs.push(mapped.input);
        validRows.push(row);
      }
      if (skippedRows.length) setRows(skippedRows, { status: 'skipped', errorCode: 'invalid-contact' });
      if (!validRows.length) return;
      setRows(validRows, { status: 'syncing' });

      let response;
      try {
        response = await fetcher(HUBSPOT_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs }),
          signal: AbortSignal.timeout(20000),
        });
      } catch {
        setRows(validRows, { status: 'failed', incrementAttempts: true, errorCode: 'network' });
        return;
      }
      const result = await response.json().catch(() => ({}));
      const hasErrors = Array.isArray(result.errors) && result.errors.length > 0;
      if (!response.ok || hasErrors || result.numErrors > 0) {
        setRows(validRows, { status: 'failed', incrementAttempts: true, errorCode: `hubspot-http-${response.status}` });
        return;
      }
      setRows(validRows, { status: 'synced', incrementAttempts: true, synced: true });
    } finally {
      running = false;
    }
  }

  // Stale in-flight jobs are safe to retry because the contact operation upserts by email.
  db.prepare("UPDATE hubspot_sync_queue SET status='pending' WHERE status='syncing'").run();
  const timer = setInterval(() => { void processPending().catch(() => {}); }, 30000);
  timer.unref?.();

  return { configured, queueUser, queueExistingAccounts, status, processPending };
}
