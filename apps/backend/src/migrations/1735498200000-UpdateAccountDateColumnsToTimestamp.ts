import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración para cambiar las columnas lastPaymentDate y lastPurchaseDate
 * de tipo 'date' a 'timestamp' para capturar la hora exacta.
 * 
 * Esto permite mostrar correctamente "hace X minutos/horas" en la UI
 * en lugar de solo la fecha.
 */
export class UpdateAccountDateColumnsToTimestamp1735498200000 implements MigrationInterface {
    name = 'UpdateAccountDateColumnsToTimestamp1735498200000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Cambiar lastPaymentDate de date a timestamp
        await queryRunner.query(`
            ALTER TABLE "customer_accounts"
            ALTER COLUMN "lastPaymentDate" TYPE timestamp without time zone
            USING "lastPaymentDate"::timestamp without time zone
        `);

        // Cambiar lastPurchaseDate de date a timestamp
        await queryRunner.query(`
            ALTER TABLE "customer_accounts"
            ALTER COLUMN "lastPurchaseDate" TYPE timestamp without time zone
            USING "lastPurchaseDate"::timestamp without time zone
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revertir a date (perderá información de hora)
        await queryRunner.query(`
            ALTER TABLE "customer_accounts"
            ALTER COLUMN "lastPaymentDate" TYPE date
            USING "lastPaymentDate"::date
        `);

        await queryRunner.query(`
            ALTER TABLE "customer_accounts"
            ALTER COLUMN "lastPurchaseDate" TYPE date
            USING "lastPurchaseDate"::date
        `);
    }
}
