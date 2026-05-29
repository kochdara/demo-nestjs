const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split('=');

    if (!process.env[key]) {
      process.env[key] = valueParts.join('=').replace(/^"|"$/g, '');
    }
  }
}

function getConnectionConfig(databaseUrl) {
  const url = new URL(databaseUrl);

  return {
    host: url.hostname,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    port: Number(url.port || 3306),
    database: url.pathname.replace('/', ''),
    multipleStatements: true,
  };
}

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  loadEnvFile(path.join(rootDir, '.env'));

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const migrationsDir = path.join(rootDir, 'database', 'migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const connection = await mysql.createConnection(
    getConnectionConfig(process.env.DATABASE_URL),
  );

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`_raw_sql_migrations\` (
        \`id\` INTEGER NOT NULL AUTO_INCREMENT,
        \`name\` VARCHAR(191) NOT NULL,
        \`appliedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`_raw_sql_migrations_name_key\`(\`name\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    const [appliedRows] = await connection.query(
      'SELECT `name` FROM `_raw_sql_migrations`',
    );
    const applied = new Set(appliedRows.map((row) => row.name));

    for (const file of migrationFiles) {
      if (applied.has(file)) {
        console.log(`skip ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await connection.beginTransaction();

      try {
        await connection.query(sql);
        await connection.query(
          'INSERT INTO `_raw_sql_migrations` (`name`) VALUES (?)',
          [file],
        );
        await connection.commit();
        console.log(`applied ${file}`);
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
