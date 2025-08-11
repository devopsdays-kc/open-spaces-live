// scripts/seed-admin.js

import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

async function main() {
	console.log('--- Admin User Seeding ---');

	const rl = readline.createInterface({ input, output });

	const email = await rl.question('Please enter the email for the initial admin user: ');

	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		console.error('Invalid email address provided. Aborting.');
		rl.close();
		return;
	}

	rl.close();

	console.log(`\nSetting up admin user: ${email}`);

	// Construct the SQL statement, ensuring the email is properly quoted for the SQL command.
	const id = `usr_${crypto.randomUUID()}`;
	const role = 'admin';
	const sql = `INSERT INTO users (id, email, role, created_at) VALUES ('${id}', '${email}', '${role}', unixepoch());`;

	// Construct the wrangler command
	// Note: We need to find the database name from wrangler.jsonc, but for now we'll hardcode it.
	// A more robust solution might parse the config file.
	const dbName = 'open-spaces-live';
	const command = `npx wrangler d1 execute ${dbName} --remote --command "${sql}"`;

	console.log('Executing command...');
	console.log(command);

	try {
		const { stdout, stderr } = await execAsync(command);
		if (stderr) {
			// Check for a unique constraint error
			if (stderr.includes('UNIQUE constraint failed')) {
				console.error(`\nError: An admin user with the email "${email}" may already exist.`);
				console.error('If you need to create a new admin, please use a different email or clear the users table.');
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
	}
}

main();
