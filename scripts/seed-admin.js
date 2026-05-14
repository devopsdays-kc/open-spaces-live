import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execAsync = promisify(exec);
const DB_NAME = 'open-spaces-live-db';

async function main() {
	console.log('--- Admin User Seeding ---');

	const rl = readline.createInterface({ input, output });
	const email = await rl.question('Please enter the email for the initial admin user: ');
	rl.close();

	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		console.error('Invalid email address provided. Aborting.');
		return;
	}

	console.log(`\nSetting up admin user: ${email}`);

	const id = `usr_${crypto.randomUUID()}`;
	// wrangler d1 execute --file requires raw SQL; no parameterized binding available via CLI.
	const safeEmail = email.replace(/'/g, "''");
	const sql = `INSERT INTO users (id, email, role, created_at) VALUES ('${id}', '${safeEmail}', 'admin', unixepoch());\n`;

	const sqlFile = join(tmpdir(), `seed-admin-${Date.now()}.sql`);
	writeFileSync(sqlFile, sql, 'utf8');

	const command = `npx wrangler d1 execute ${DB_NAME} --remote --file "${sqlFile}"`;
	console.log('Executing command...');
	try {
		const { stderr } = await execAsync(command);
		if (stderr) {
			if (stderr.includes('UNIQUE constraint failed')) {
				console.error(`\nError: An admin user with the email "${email}" may already exist.`);
				console.error('Use a different email or clear the users table.');
			} else {
				console.error('\nAn error occurred while seeding the database:');
				console.error(stderr);
			}
			return;
		}
		console.log('\n--- Success! ---');
		console.log('Admin user created successfully.');
		console.log('You can now log in by visiting the application and using the login button.');
	} catch (error) {
		console.error('\nFailed to execute wrangler command:', error);
	} finally {
		try { unlinkSync(sqlFile); } catch { /* temp file already gone */ }
	}
}

main();
