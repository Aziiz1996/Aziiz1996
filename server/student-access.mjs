export function createStudentAccess(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS student_access (user_id TEXT PRIMARY KEY, approval TEXT NOT NULL CHECK(approval IN ('pending','approved','rejected')));
    CREATE TABLE IF NOT EXISTS student_access_audit (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, approval TEXT NOT NULL, actor TEXT NOT NULL, at INTEGER NOT NULL)`);
  function status(id) {
    return { approval: db.prepare('SELECT approval FROM student_access WHERE user_id=?').get(id)?.approval || 'pending',
      phoneVerified: Boolean(db.prepare('SELECT verified_phone FROM account_details WHERE user_id=?').get(id)?.verified_phone) };
  }
  function decide(id, approval, actor) {
    if (!['pending', 'approved', 'rejected'].includes(approval)) throw Error('حالة الاعتماد غير صالحة.');
    const user = db.prepare('SELECT owner FROM users WHERE id=?').get(id);
    if (!user || user.owner) throw Error('حساب الطالب غير موجود.');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO student_access VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET approval=excluded.approval').run(id, approval);
      db.prepare('INSERT INTO student_access_audit(user_id,approval,actor,at) VALUES (?,?,?,?)').run(id, approval, actor, Date.now());
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return { status, decide };
}
