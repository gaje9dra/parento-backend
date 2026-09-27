import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config/env.js';
import { createDatabase } from '../db/index.js';
import { DevelopmentAdminProvisioningService } from '../services/development-admin-provisioning-service.js';

const main = async (): Promise<void> => {
  const config = loadConfig();

  if (config.app.environment === 'production') {
    throw new Error(
      'Development administrator provisioning is disabled in production.',
    );
  }

  const email = process.env.PARENTO_DEV_ADMIN_EMAIL;
  const password = process.env.PARENTO_DEV_ADMIN_PASSWORD;

  if (email === undefined || email.trim() === '') {
    throw new Error('PARENTO_DEV_ADMIN_EMAIL is required.');
  }
  if (password === undefined || password.length === 0) {
    throw new Error('PARENTO_DEV_ADMIN_PASSWORD is required.');
  }

  const database = createDatabase(config);
  if (!database.configured) {
    throw new Error(
      'DATABASE_URL is required for development admin provisioning.',
    );
  }

  try {
    const service = new DevelopmentAdminProvisioningService(
      database,
      config.app.environment,
    );
    const result = await service.provision({ email, password });

    if (result.created) {
      process.stdout.write(
        'Development admin provisioned successfully.\nEmail: ' +
          result.email +
          '\n',
      );
    } else {
      process.stdout.write(
        'Development admin already exists with the configured credentials; no changes were made.\nEmail: ' +
          result.email +
          '\n',
      );
    }
  } finally {
    await database.close();
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch {
    process.stderr.write(
      'Development admin provisioning failed. Check the development configuration and database connectivity.\n',
    );
    process.exitCode = 1;
  }
}
