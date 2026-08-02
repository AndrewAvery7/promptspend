/**
 * Every test file gets a fresh, fully migrated database.
 *
 * Running the real migrations rather than a hand-written CREATE TABLE means the
 * schema under test is the schema that will be deployed — including the CHECK
 * constraints, which are load-bearing here.
 */
import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
