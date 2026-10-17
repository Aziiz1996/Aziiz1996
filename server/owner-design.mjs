import { unlink } from 'node:fs/promises';
/** Additive configuration and manual backups on the existing persistent account database. */
const PAGES = ['dashboard', 'university', 'courses', 'plan', 'tasks', 'exams', 'practice', 'assistant', 'logistics', 'updates', 'notes', 'finance', 'groups', 'profile', 'opportunities', 'settings', 'owner'];
export const DEFAULT_OWNER_DESIGN = Object.freeze({
  appName: 'عز اللوجستيات', welcomeTitle: 'خطوة اليوم تصنع غداً أجمل.',
  welcomeMessage: 'يا هلا بلوجستي المستقبل! نرتّب دراستك ومواعيدك ومصروفاتك، ونمشي معك خطوة بخطوة.',
  accentColor: '#FF6B00', navigation: PAGES, hiddenPages: [],
});
export function validateOwnerDesign(value) {
  const pages = items => Array.isArray(items) && items.length <= PAGES.length && items.every(page => PAGES.includes(page)) && new Set(items).size === items.length;
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.appName !== 'string' || !value.appName.trim() || value.appName.length > 80 || typeof value.welcomeTitle !== 'string' || value.welcomeTitle.length > 200 || typeof value.welcomeMessage !== 'string' || value.welcomeMessage.length > 1000 || typeof value.accentColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.accentColor) || !pages(value.navigation) || !pages(value.hiddenPages) || value.hiddenPages.includes('dashboard') || value.hiddenPages.includes('owner')) return null;
  return { appName: value.appName.trim(), welcomeTitle: value.welcomeTitle, welcomeMessage: value.welcomeMessage, accentColor: value.accentColor,
    navigation: [...value.navigation, ...PAGES.filter(page => !value.navigation.includes(page))], hiddenPages: [...value.hiddenPages] };
}
export function createOwnerDesignService(db) {
  db.exec('CREATE TABLE IF NOT EXISTS app_design (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS owner_backups (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS owner_bootstrap (user_id TEXT PRIMARY KEY, credentials_path TEXT NOT NULL);');
  return {
    getDesign() { const row = db.prepare('SELECT data FROM app_design WHERE id=1').get(); try { return (row && validateOwnerDesign(JSON.parse(row.data))) || DEFAULT_OWNER_DESIGN; } catch { return DEFAULT_OWNER_DESIGN; } },
    saveDesign(value) { const valid = validateOwnerDesign(value); if (!valid) return null; db.prepare('INSERT INTO app_design (id,data) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(valid)); return valid; },
    getBackup(userId) { const row = db.prepare('SELECT data FROM owner_backups WHERE user_id=?').get(userId); return row ? JSON.parse(row.data) : null; },
    saveBackup(userId, data) { db.prepare('INSERT INTO owner_backups (user_id,data,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(userId, JSON.stringify(data), new Date().toISOString()); },
    async removeInitialCredentials(userId) {
      const row = db.prepare('SELECT credentials_path FROM owner_bootstrap WHERE user_id=?').get(userId);
      if (!row) return;
      try { await unlink(row.credentials_path); } catch (error) { if (error.code !== 'ENOENT') return; }
      db.prepare('DELETE FROM owner_bootstrap WHERE user_id=?').run(userId);
    },
  };
}
