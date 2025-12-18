import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Cargar variables de entorno
config({ path: '../../.env' });

interface TableInfo {
    table_name: string;
    columns: ColumnInfo[];
    primaryKeys: string[];
    foreignKeys: ForeignKeyInfo[];
    indexes: IndexInfo[];
}

interface ColumnInfo {
    column_name: string;
    data_type: string;
    udt_name: string;
    column_default: string | null;
    is_nullable: string;
    character_maximum_length: number | null;
    numeric_precision: number | null;
    numeric_scale: number | null;
}

interface ForeignKeyInfo {
    constraint_name: string;
    column_name: string;
    foreign_table_name: string;
    foreign_column_name: string;
    on_delete: string;
    on_update: string;
}

interface IndexInfo {
    indexname: string;
    indexdef: string;
}

async function generateFullMigration() {
    console.log('🔍 Conectando a la base de datos...');

    const dataSource = new DataSource({
        type: 'postgres',
        host: process.env.DATABASE_HOST || 'localhost',
        port: Number(process.env.DATABASE_PORT) || 5432,
        username: process.env.DATABASE_USER || 'postgres',
        password: process.env.DATABASE_PASSWORD || 'postgres',
        database: process.env.DATABASE_NAME || 'nexopos',
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

    const upStatements: string[] = [];
    const downStatements: string[] = [];

    // Primero habilitar uuid-ossp
    upStatements.push('        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);');
    upStatements.push('');

    // Obtener enums
    const enums = await dataSource.query(`
        SELECT t.typname as enum_name, 
               array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
        GROUP BY t.typname
    `);

    console.log(`📋 Enums encontrados: ${enums.length}`);

    // Crear enums
    for (const enumType of enums) {
        // enum_values puede venir como string "{val1,val2}" o como array
        let enumValues: string[];
        if (typeof enumType.enum_values === 'string') {
            // Parsear el string de PostgreSQL "{val1,val2,val3}"
            enumValues = enumType.enum_values.replace(/[{}]/g, '').split(',');
        } else {
            enumValues = enumType.enum_values;
        }
        const values = enumValues.map((v: string) => `'${v}'`).join(', ');
        upStatements.push(`        await queryRunner.query(\`CREATE TYPE "${enumType.enum_name}" AS ENUM(${values})\`);`);
        downStatements.unshift(`        await queryRunner.query(\`DROP TYPE IF EXISTS "${enumType.enum_name}"\`);`);
    }
    upStatements.push('');

    // Para cada tabla, obtener la definición completa
    for (const { table_name } of tables) {
        // Obtener columnas
        const columns: ColumnInfo[] = await dataSource.query(`
            SELECT 
                c.column_name,
                c.data_type,
                c.udt_name,
                c.column_default,
                c.is_nullable,
                c.character_maximum_length,
                c.numeric_precision,
                c.numeric_scale
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

        // Construir CREATE TABLE
        const columnDefs: string[] = [];

        for (const col of columns) {
            let colDef = `"${col.column_name}" `;

            // Tipo de dato
            if (col.data_type === 'USER-DEFINED') {
                colDef += `"${col.udt_name}"`;
            } else if (col.data_type === 'character varying') {
                colDef += col.character_maximum_length ? `varchar(${col.character_maximum_length})` : 'varchar';
            } else if (col.data_type === 'numeric') {
                colDef += `numeric(${col.numeric_precision},${col.numeric_scale})`;
            } else if (col.data_type === 'ARRAY') {
                colDef += `${col.udt_name.replace('_', '')}[]`;
            } else {
                colDef += col.data_type;
            }

            // NOT NULL
            if (col.is_nullable === 'NO') {
                colDef += ' NOT NULL';
            }

            // DEFAULT
            if (col.column_default) {
                // Limpiar el default value
                let defaultVal = col.column_default;
                // Si es un cast de enum, simplificarlo
                if (defaultVal.includes('::')) {
                    const parts = defaultVal.split('::');
                    defaultVal = parts[0];
                }
                colDef += ` DEFAULT ${defaultVal}`;
            }

            columnDefs.push(colDef);
        }

        // Agregar PRIMARY KEY
        if (pks.length > 0) {
            const pkCols = pks.map((pk: { column_name: string }) => `"${pk.column_name}"`).join(', ');
            columnDefs.push(`PRIMARY KEY (${pkCols})`);
        }

        const createTable = `        await queryRunner.query(\`
            CREATE TABLE "${table_name}" (
                ${columnDefs.join(',\n                ')}
            )
        \`);`;

        upStatements.push(createTable);
        upStatements.push('');

        downStatements.unshift(`        await queryRunner.query(\`DROP TABLE IF EXISTS "${table_name}" CASCADE\`);`);

        console.log(`  ✓ ${table_name}`);
    }

    // Obtener foreign keys
    const foreignKeys = await dataSource.query(`
        SELECT
            tc.table_name,
            tc.constraint_name,
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name,
            rc.delete_rule,
            rc.update_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints rc
            ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        ORDER BY tc.table_name
    `);

    console.log(`\n📋 Foreign Keys: ${foreignKeys.length}`);

    // Agregar foreign keys
    upStatements.push('        // Foreign Keys');
    for (const fk of foreignKeys) {
        const onDelete = fk.delete_rule !== 'NO ACTION' ? ` ON DELETE ${fk.delete_rule}` : '';
        const onUpdate = fk.update_rule !== 'NO ACTION' ? ` ON UPDATE ${fk.update_rule}` : '';

        upStatements.push(`        await queryRunner.query(\`
            ALTER TABLE "${fk.table_name}" 
            ADD CONSTRAINT "${fk.constraint_name}" 
            FOREIGN KEY ("${fk.column_name}") 
            REFERENCES "${fk.foreign_table_name}"("${fk.foreign_column_name}")${onDelete}${onUpdate}
        \`);`);
    }

    // Obtener índices (no primary keys ni unique constraints)
    const indexes = await dataSource.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
        AND indexname NOT LIKE '%_pkey'
        AND indexdef NOT LIKE '%UNIQUE%'
        ORDER BY tablename, indexname
    `);

    console.log(`📋 Índices: ${indexes.length}`);

    upStatements.push('');
    upStatements.push('        // Indexes');
    for (const idx of indexes) {
        // Escapar backticks en la definición del índice
        const indexDef = idx.indexdef.replace(/`/g, '\\`');
        upStatements.push(`        await queryRunner.query(\`${indexDef}\`);`);
    }

    await dataSource.destroy();

    // Generar el archivo de migración
    const timestamp = '1734450000000'; // Timestamp fijo para consistencia
    const migrationContent = `import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración inicial que crea todas las tablas del sistema.
 * Generada automáticamente basándose en el schema existente.
 * 
 * Incluye:
 * - 31 tablas
 * - ${enums.length} enums
 * - ${foreignKeys.length} foreign keys
 * - ${indexes.length} índices
 */
export class InitialSchema${timestamp} implements MigrationInterface {
    name = 'InitialSchema${timestamp}';

    public async up(queryRunner: QueryRunner): Promise<void> {
${upStatements.join('\n')}
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
${downStatements.join('\n')}
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

    console.log(`\n✅ Migración COMPLETA creada: ${migrationPath}`);
    console.log('\nActualiza migrations.ts para importar InitialSchema1734450000000');
}

generateFullMigration().catch(console.error);
