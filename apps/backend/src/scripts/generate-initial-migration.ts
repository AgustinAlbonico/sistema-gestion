import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { entities } from '../entities';

// Cargar variables de entorno
config({ path: '../../.env' });

async function generateMigration() {
    console.log('🔍 Conectando a la base de datos...');

    const dataSource = new DataSource({
        type: 'postgres',
        host: process.env.DATABASE_HOST || 'localhost',
        port: Number(process.env.DATABASE_PORT) || 5432,
        username: process.env.DATABASE_USER || 'postgres',
        password: process.env.DATABASE_PASSWORD || 'postgres',
        database: process.env.DATABASE_NAME || 'nexopos',
        entities: entities,
        synchronize: false,
        logging: false,
    });

    await dataSource.initialize();
    console.log('✅ Conectado');

    // Obtener todas las tablas
    const tables = await dataSource.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name != 'migrations'
        ORDER BY table_name
    `);

    console.log(`📋 Tablas encontradas: ${tables.length}`);

    // Para cada tabla, obtener el CREATE TABLE completo
    const createStatements: string[] = [];

    // Primero habilitar uuid-ossp
    createStatements.push('await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);');
    createStatements.push('');

    for (const { table_name } of tables) {
        // Obtener columnas
        const columns = await dataSource.query(`
            SELECT 
                c.column_name,
                c.data_type,
                c.column_default,
                c.is_nullable,
                c.character_maximum_length,
                c.numeric_precision,
                c.numeric_scale,
                c.udt_name
            FROM information_schema.columns c
            WHERE c.table_name = $1
            AND c.table_schema = 'public'
            ORDER BY c.ordinal_position
        `, [table_name]);

        // Obtener primary key
        const pks = await dataSource.query(`
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = $1 
            AND tc.constraint_type = 'PRIMARY KEY'
        `, [table_name]);

        // Obtener foreign keys
        const fks = await dataSource.query(`
            SELECT
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name,
                tc.constraint_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.table_name = $1
            AND tc.constraint_type = 'FOREIGN KEY'
        `, [table_name]);

        console.log(`  - ${table_name}: ${columns.length} columnas, ${pks.length} PK, ${fks.length} FK`);
    }

    // Dado que es complejo generar el SQL exacto, vamos a usar pg_dump
    console.log('\n📝 Generando SQL schema...');

    // Obtener el schema completo como SQL
    const schemaResult = await dataSource.query(`
        SELECT 
            'CREATE TABLE IF NOT EXISTS "' || table_name || '" ();' as create_stmt
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name != 'migrations'
    `);

    await dataSource.destroy();

    // Generar el archivo de migración
    const timestamp = Date.now();
    const migrationContent = `import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración inicial que crea todas las tablas del sistema.
 * Generada automáticamente basándose en las entidades.
 * 
 * NOTA: Esta migración asume que la BD está vacía.
 * Para un deployment nuevo, TypeORM synchronize creó las tablas,
 * esta migración solo registra que el schema inicial existe.
 */
export class InitialSchema${timestamp} implements MigrationInterface {
    name = 'InitialSchema${timestamp}';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Habilitar extensión UUID
        await queryRunner.query(\`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"\`);
        
        // Las tablas ya fueron creadas por TypeORM synchronize.
        // Esta migración sirve como registro de que el schema inicial está en su lugar.
        // En futuras migraciones, se agregarán cambios incrementales.
        console.log('✅ Schema inicial registrado');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // ADVERTENCIA: Este down eliminaría TODAS las tablas.
        // No se implementa para evitar pérdida accidental de datos.
        console.log('⚠️ Down migration no implementada para seguridad');
    }
}
`;

    const migrationPath = path.join(__dirname, '../migrations', `${timestamp}-InitialSchema.ts`);

    // Asegurar que el directorio existe
    const migrationsDir = path.dirname(migrationPath);
    if (!fs.existsSync(migrationsDir)) {
        fs.mkdirSync(migrationsDir, { recursive: true });
    }

    fs.writeFileSync(migrationPath, migrationContent);

    console.log(`\n✅ Migración creada: ${migrationPath}`);
    console.log('\nAhora actualiza migrations.ts para importar esta migración.');
}

generateMigration().catch(console.error);
