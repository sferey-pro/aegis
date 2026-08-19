import { getDb } from "./index";

export function getSetting(key: string, defaultValue = ""): string {
	const db = getDb();
	const row = db.query(`SELECT value FROM settings WHERE key = ?`).get(key) as
		| { value: string }
		| undefined;
	return row ? row.value : defaultValue;
}

export function setSetting(key: string, value: string): void {
	const db = getDb();
	db.query(`
    INSERT INTO settings (key, value) 
    VALUES ($key, $value)
    ON CONFLICT(key) DO UPDATE SET value = $value
  `).run({ $key: key, $value: value });
}

export function getAllSettings(): Record<string, string> {
	const db = getDb();
	const rows = db.query(`SELECT key, value FROM settings`).all() as {
		key: string;
		value: string;
	}[];
	return rows.reduce(
		(acc, row) => {
			acc[row.key] = row.value;
			return acc;
		},
		{} as Record<string, string>,
	);
}

export function setAllSettings(settings: Record<string, string>): void {
	const db = getDb();
	const stmt = db.prepare(`
    INSERT INTO settings (key, value) 
    VALUES ($key, $value)
    ON CONFLICT(key) DO UPDATE SET value = $value
  `);
	db.transaction(() => {
		for (const [key, value] of Object.entries(settings)) {
			if (value !== undefined && value !== null) {
				stmt.run({ $key: key, $value: value.toString() });
			}
		}
	})();
}
