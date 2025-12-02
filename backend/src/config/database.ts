import knex from 'knex';
import { config } from './env';
import { logger } from '../utils/logger';

export const db = knex({
  client: 'pg',
  connection: {
    host: config.DB.HOST,
    port: config.DB.PORT,
    user: config.DB.USER,
    password: config.DB.PASSWORD,
    database: config.DB.NAME,
    ssl: config.DB.SSL ? { rejectUnauthorized: false } : false
  },
  pool: {
    min: config.DB.POOL.MIN,
    max: config.DB.POOL.MAX,
    afterCreate: (conn: any, done: any) => {
      logger.info('Database connection established');
      done(null, conn);
    }
  },
  migrations: {
    tableName: 'knex_migrations',
    directory: './migrations'
  },
  seeds: {
    directory: './seeds'
  },
  debug: config.NODE_ENV === 'development'
});

// Test database connection
export const testConnection = async (): Promise<boolean> => {
  try {
    await db.raw('SELECT 1');
    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  }
};

// Create tables if they don't exist (for development)
export const initializeDatabase = async (): Promise<void> => {
  try {
    // Check if tables exist
    const tables = await db('pg_tables')
      .select('tablename')
      .where('schemaname', 'public');
    
    const tableNames = tables.map(t => t.tablename);
    
    if (!tableNames.includes('users')) {
      await createUsersTable();
    }
    
    if (!tableNames.includes('kyc_attempts')) {
      await createKYCAttemptsTable();
    }
    
    if (!tableNames.includes('device_fingerprints')) {
      await createDeviceFingerprintsTable();
    }
    
    if (!tableNames.includes('audit_logs')) {
      await createAuditLogsTable();
    }
    
    logger.info('Database initialized successfully');
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
};

const createUsersTable = async () => {
  await db.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table.string('email').unique().notNullable();
    table.string('phone').unique();
    table.string('first_name').notNullable();
    table.string('last_name').notNullable();
    table.date('date_of_birth');
    table.enum('kyc_status', [
      'pending',
      'in_progress',
      'approved',
      'rejected',
      'under_review'
    ]).defaultTo('pending');
    table.integer('kyc_attempts').defaultTo(0);
    table.jsonb('metadata');
    table.timestamp('last_kyc_attempt_at');
    table.timestamp('kyc_approved_at');
    table.timestamps(true, true);
    
    table.index(['email', 'kyc_status', 'created_at']);
  });
};

const createKYCAttemptsTable = async () => {
  await db.schema.createTable('kyc_attempts', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('selfie_key');
    table.string('id_front_key');
    table.string('id_back_key');
    table.jsonb('embeddings');
    table.float('liveness_score');
    table.float('match_score');
    table.float('fraud_score');
    table.float('document_quality_score');
    table.jsonb('ml_response');
    table.enum('status', [
      'pending',
      'processing',
      'completed',
      'failed',
      'manual_review'
    ]).defaultTo('pending');
    table.string('failure_reason');
    table.jsonb('device_metadata');
    table.jsonb('geolocation');
    table.string('ip_address');
    table.timestamps(true, true);
    
    table.index(['user_id', 'status', 'created_at']);
    table.index(['liveness_score', 'match_score']);
  });
};

const createDeviceFingerprintsTable = async () => {
  await db.schema.createTable('device_fingerprints', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('fingerprint_hash').notNullable();
    table.string('user_agent');
    table.string('browser_name');
    table.string('browser_version');
    table.string('os');
    table.string('device_type');
    table.string('screen_resolution');
    table.string('language');
    table.string('timezone');
    table.boolean('is_mobile').defaultTo(false);
    table.boolean('is_tablet').defaultTo(false);
    table.boolean('is_desktop').defaultTo(false);
    table.jsonb('plugins');
    table.jsonb('fonts');
    table.timestamps(true, true);
    
    table.unique(['user_id', 'fingerprint_hash']);
    table.index(['fingerprint_hash', 'user_id']);
  });
};

const createAuditLogsTable = async () => {
  await db.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    table.uuid('user_id').nullable();
    table.string('action').notNullable();
    table.string('resource_type').notNullable();
    table.string('resource_id').nullable();
    table.jsonb('metadata');
    table.string('ip_address');
    table.string('user_agent');
    table.timestamps(true, true);
    
    table.index(['user_id', 'action', 'created_at']);
    table.index(['resource_type', 'resource_id']);
  });
};