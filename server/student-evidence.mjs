export function createStudentEvidence(db) {
 db.exec("CREATE TABLE IF NOT EXISTS student_evidence (user_id TEXT PRIMARY KEY, filename TEXT NOT NULL, bytes BLOB NOT NULL, submitted_at TEXT NOT NULL);");
 const read = id => db.prepare('SELECT filename,length(bytes) AS size,submitted_at FROM student_evidence WHERE user_id=?').get(id) || null;
 function submit(id, encoded) {
  if (typeof encoded !== 'string' || encoded.length > 7_100_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw Error('إثبات PDF غير صالح.');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 8 || bytes.length > 5 * 1024 * 1024 || bytes.subarray(0,5).toString() !== '%PDF-') throw Error('يجب رفع إثبات PDF بحجم أقل من 5 ميغابايت.');
  db.prepare('INSERT INTO student_evidence(user_id,filename,bytes,submitted_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET filename=excluded.filename,bytes=excluded.bytes,submitted_at=excluded.submitted_at').run(id,'enrollment.pdf',bytes,new Date().toISOString());
  db.prepare("INSERT INTO student_access(user_id,approval) VALUES(?,'pending') ON CONFLICT(user_id) DO UPDATE SET approval='pending'").run(id);
  return read(id);
 }
 const bytes = id => db.prepare('SELECT bytes FROM student_evidence WHERE user_id=?').get(id)?.bytes || null;
 return {read,submit,bytes};
}
