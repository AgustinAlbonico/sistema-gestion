import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración inicial que crea todas las tablas del sistema.
 * Generada automáticamente basándose en el schema existente.
 * 
 * Incluye:
 * - 31 tablas
 * - 16 enums
 * - 36 foreign keys
 * - 48 índices
 */
export class InitialSchema1734450000000 implements MigrationInterface {
    name = 'InitialSchema1734450000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

        await queryRunner.query(`CREATE TYPE "account_movements_movementtype_enum" AS ENUM('charge', 'payment', 'adjustment', 'discount', 'interest')`);
        await queryRunner.query(`CREATE TYPE "backups_status_enum" AS ENUM('pending', 'completed', 'failed')`);
        await queryRunner.query(`CREATE TYPE "cash_movements_movementtype_enum" AS ENUM('income', 'expense')`);
        await queryRunner.query(`CREATE TYPE "cash_registers_status_enum" AS ENUM('open', 'closed')`);
        await queryRunner.query(`CREATE TYPE "customer_accounts_status_enum" AS ENUM('active', 'suspended', 'closed')`);
        await queryRunner.query(`CREATE TYPE "customers_documenttype_enum" AS ENUM('DNI', 'CUIT', 'CUIL', 'PASAPORTE', 'OTRO')`);
        await queryRunner.query(`CREATE TYPE "customers_ivacondition_enum" AS ENUM('CONSUMIDOR_FINAL', 'RESPONSABLE_MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO', 'EXENTO')`);
        await queryRunner.query(`CREATE TYPE "fiscal_configuration_afipenvironment_enum" AS ENUM('homologacion', 'produccion')`);
        await queryRunner.query(`CREATE TYPE "fiscal_configuration_ivacondition_enum" AS ENUM('CONSUMIDOR_FINAL', 'RESPONSABLE_MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO', 'EXENTO')`);
        await queryRunner.query(`CREATE TYPE "invoices_status_enum" AS ENUM('pending', 'authorized', 'rejected', 'error')`);
        await queryRunner.query(`CREATE TYPE "purchases_status_enum" AS ENUM('pending', 'paid')`);
        await queryRunner.query(`CREATE TYPE "sales_status_enum" AS ENUM('completed', 'pending', 'partial', 'cancelled')`);
        await queryRunner.query(`CREATE TYPE "stock_movements_source_enum" AS ENUM('INITIAL_LOAD', 'PURCHASE', 'SALE', 'ADJUSTMENT', 'RETURN')`);
        await queryRunner.query(`CREATE TYPE "stock_movements_type_enum" AS ENUM('IN', 'OUT')`);
        await queryRunner.query(`CREATE TYPE "suppliers_documenttype_enum" AS ENUM('DNI', 'CUIT', 'CUIL', 'OTRO')`);
        await queryRunner.query(`CREATE TYPE "suppliers_ivacondition_enum" AS ENUM('CONSUMIDOR_FINAL', 'RESPONSABLE_MONOTRIBUTO', 'RESPONSABLE_INSCRIPTO', 'EXENTO')`);

        await queryRunner.query(`
            CREATE TABLE "account_movements" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "accountId" uuid NOT NULL,
                "movementType" "account_movements_movementtype_enum" NOT NULL,
                "amount" numeric(12,2) NOT NULL,
                "balanceBefore" numeric(12,2) NOT NULL,
                "balanceAfter" numeric(12,2) NOT NULL,
                "description" varchar(200) NOT NULL,
                "referenceType" varchar(50),
                "referenceId" uuid,
                "paymentMethodId" uuid,
                "notes" text,
                "createdById" uuid,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                "deletedAt" timestamp without time zone,
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "audit_logs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "entity_type" varchar(50) NOT NULL,
                "entity_id" uuid NOT NULL,
                "action" varchar(20) NOT NULL,
                "user_id" uuid NOT NULL,
                "previous_values" jsonb,
                "new_values" jsonb,
                "metadata" jsonb,
                "description" varchar(500),
                "timestamp" timestamp without time zone NOT NULL DEFAULT now(),
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "backups" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "filename" varchar(255) NOT NULL,
                "filePath" varchar(500) NOT NULL,
                "sizeBytes" bigint NOT NULL DEFAULT '0',
                "status" "backups_status_enum" NOT NULL DEFAULT 'pending',
                "errorMessage" varchar(255),
                "createdByUsername" varchar(100),
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "cash_movements" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "movementType" "cash_movements_movementtype_enum" NOT NULL,
                "referenceType" varchar(50),
                "referenceId" uuid,
                "manualAmount" numeric(12,2),
                "manualDescription" varchar(200),
                "manual_payment_method_id" uuid,
                "manualNotes" varchar(1000),
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                "deletedAt" timestamp without time zone,
                "cash_register_id" uuid,
                "created_by" uuid,
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "cash_register_totals" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "payment_method_id" uuid NOT NULL,
                "initialAmount" numeric(12,2) NOT NULL DEFAULT '0',
                "totalIncome" numeric(12,2) NOT NULL DEFAULT '0',
                "totalExpense" numeric(12,2) NOT NULL DEFAULT '0',
                "expectedAmount" numeric(12,2) NOT NULL DEFAULT '0',
                "actualAmount" numeric(12,2),
                "difference" numeric(12,2),
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                "cash_register_id" uuid,
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "cash_registers" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "date" date NOT NULL,
                "openedAt" timestamp without time zone NOT NULL,
                "closedAt" timestamp without time zone,
                "initialAmount" numeric(12,2) NOT NULL,
                "totalIncome" numeric(12,2) NOT NULL DEFAULT '0',
                "totalExpense" numeric(12,2) NOT NULL DEFAULT '0',
                "expectedAmount" numeric(12,2),
                "actualAmount" numeric(12,2),
                "difference" numeric(12,2),
                "status" "cash_registers_status_enum" NOT NULL DEFAULT 'open',
                "openingNotes" text,
                "closingNotes" text,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                "deletedAt" timestamp without time zone,
                "opened_by" uuid,
                "closed_by" uuid,
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "categories" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar(100) NOT NULL,
                "description" text,
                "color" varchar(7),
                "profitMargin" numeric(5,2),
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "customer_accounts" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "customerId" uuid NOT NULL,
                "balance" numeric(12,2) NOT NULL DEFAULT '0',
                "creditLimit" numeric(12,2) NOT NULL DEFAULT '0',
                "status" "customer_accounts_status_enum" NOT NULL DEFAULT 'active',
                "daysOverdue" integer NOT NULL DEFAULT 0,
                "lastPaymentDate" date,
                "lastPurchaseDate" date,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                "deletedAt" timestamp without time zone,
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "customer_categories" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar(100) NOT NULL,
                "description" text,
                "color" varchar(7),
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "customers" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "firstName" varchar(100) NOT NULL,
                "lastName" varchar(100) NOT NULL,
                "documentType" "customers_documenttype_enum",
                "ivaCondition" "customers_ivacondition_enum" DEFAULT 'CONSUMIDOR_FINAL',
                "documentNumber" varchar(50),
                "email" varchar(255),
                "phone" varchar(20),
                "mobile" varchar(20),
                "address" varchar(255),
                "city" varchar(100),
                "state" varchar(100),
                "postalCode" varchar(20),
                "categoryId" uuid,
                "notes" text,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "expense_categories" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar(100) NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "description" text,
                "isRecurring" boolean NOT NULL DEFAULT false,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "expenses" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "description" varchar(200) NOT NULL,
                "amount" numeric(12,2) NOT NULL,
                "expenseDate" date NOT NULL,
                "category_id" uuid,
                "payment_method_id" uuid,
                "receiptNumber" varchar(100),
                "isPaid" boolean NOT NULL DEFAULT true,
                "paidAt" timestamp without time zone,
                "notes" text,
                "created_by" uuid,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                "deletedAt" timestamp without time zone,
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "fiscal_configuration" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "businessName" varchar(200),
                "cuit" varchar(11),
                "grossIncome" varchar(50),
                "activityStartDate" date,
                "businessAddress" varchar(300),
                "ivaCondition" "fiscal_configuration_ivacondition_enum" NOT NULL DEFAULT 'RESPONSABLE_MONOTRIBUTO',
                "pointOfSale" integer NOT NULL DEFAULT 1,
                "afipEnvironment" "fiscal_configuration_afipenvironment_enum" NOT NULL DEFAULT 'homologacion',
                "homologacionCertificate" text,
                "homologacionPrivateKey" text,
                "homologacionUploadedAt" timestamp without time zone,
                "homologacionExpiresAt" date,
                "homologacionFingerprint" varchar(64),
                "produccionCertificate" text,
                "produccionPrivateKey" text,
                "produccionUploadedAt" timestamp without time zone,
                "produccionExpiresAt" date,
                "produccionFingerprint" varchar(64),
                "isConfigured" boolean NOT NULL DEFAULT false,
                "homologacionReady" boolean NOT NULL DEFAULT false,
                "produccionReady" boolean NOT NULL DEFAULT false,
                "wsaaTokenHomologacion" text,
                "wsaaSignHomologacion" text,
                "wsaaTokenExpirationHomologacion" timestamp without time zone,
                "wsaaTokenProduccion" text,
                "wsaaSignProduccion" text,
                "wsaaTokenExpirationProduccion" timestamp without time zone,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "income_categories" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar(100) NOT NULL,
                "description" text,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                "deletedAt" timestamp without time zone,
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "incomes" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "description" varchar(200) NOT NULL,
                "amount" numeric(12,2) NOT NULL,
                "incomeDate" date NOT NULL,
                "category_id" uuid,
                "customer_id" uuid,
                "customerName" varchar(200),
                "isOnAccount" boolean NOT NULL DEFAULT false,
                "payment_method_id" uuid,
                "receiptNumber" varchar(100),
                "isPaid" boolean NOT NULL DEFAULT true,
                "paidAt" timestamp without time zone,
                "notes" text,
                "created_by" uuid,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                "deletedAt" timestamp without time zone,
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "invoices" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "sale_id" uuid NOT NULL,
                "invoiceType" integer NOT NULL,
                "pointOfSale" integer NOT NULL,
                "invoiceNumber" bigint,
                "issueDate" timestamp without time zone NOT NULL,
                "emitterCuit" varchar(11) NOT NULL,
                "emitterBusinessName" varchar(200) NOT NULL,
                "emitterAddress" varchar(300) NOT NULL,
                "emitterIvaCondition" varchar(50) NOT NULL,
                "emitterGrossIncome" varchar(50),
                "emitterActivityStartDate" date,
                "receiverDocumentType" integer NOT NULL,
                "receiverDocumentNumber" varchar(20),
                "receiverName" varchar(200),
                "receiverAddress" varchar(300),
                "receiverIvaCondition" varchar(50),
                "subtotal" numeric(12,2) NOT NULL,
                "discount" numeric(12,2) NOT NULL DEFAULT '0',
                "otherTaxes" numeric(12,2) NOT NULL DEFAULT '0',
                "total" numeric(12,2) NOT NULL,
                "netAmount" numeric(12,2) NOT NULL DEFAULT '0',
                "iva21" numeric(12,2) NOT NULL DEFAULT '0',
                "iva105" numeric(12,2) NOT NULL DEFAULT '0',
                "iva27" numeric(12,2) NOT NULL DEFAULT '0',
                "netAmountExempt" numeric(12,2) NOT NULL DEFAULT '0',
                "saleCondition" varchar(100) NOT NULL,
                "status" "invoices_status_enum" NOT NULL DEFAULT 'pending',
                "cae" varchar(14),
                "caeExpirationDate" date,
                "qrData" text,
                "pdfPath" varchar(500),
                "afipResponse" text,
                "afipErrorMessage" text,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "login_audits" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "userAgent" varchar(255),
                "success" boolean NOT NULL DEFAULT true,
                "failureReason" varchar,
                "timestamp" timestamp without time zone NOT NULL DEFAULT now(),
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "payment_methods" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar(50) NOT NULL,
                "code" varchar(50) NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                "deletedAt" timestamp without time zone,
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "products" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar(255) NOT NULL,
                "description" text,
                "sku" varchar(100),
                "barcode" varchar(100),
                "cost" numeric(10,2) NOT NULL,
                "price" numeric(10,2),
                "profitMargin" numeric(5,2),
                "stock" integer NOT NULL DEFAULT 0,
                "categoryId" uuid,
                "useCustomMargin" boolean NOT NULL DEFAULT false,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "purchase_items" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "purchase_id" uuid NOT NULL,
                "product_id" uuid NOT NULL,
                "quantity" integer NOT NULL,
                "unitPrice" numeric(10,2) NOT NULL,
                "subtotal" numeric(12,2) NOT NULL,
                "notes" text,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "purchases" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "purchaseNumber" varchar(20) NOT NULL,
                "supplier_id" uuid,
                "providerName" varchar(200) NOT NULL,
                "providerDocument" varchar(100),
                "providerPhone" varchar(100),
                "purchaseDate" date NOT NULL,
                "subtotal" numeric(12,2) NOT NULL DEFAULT '0',
                "tax" numeric(12,2) NOT NULL DEFAULT '0',
                "discount" numeric(12,2) NOT NULL DEFAULT '0',
                "total" numeric(12,2) NOT NULL DEFAULT '0',
                "status" "purchases_status_enum" NOT NULL DEFAULT 'pending',
                "payment_method_id" uuid,
                "paidAt" timestamp without time zone,
                "invoiceNumber" varchar(100),
                "notes" text,
                "inventoryUpdated" boolean NOT NULL DEFAULT false,
                "created_by" uuid,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                "deletedAt" timestamp without time zone,
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "refresh_tokens" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "token" varchar(500) NOT NULL,
                "expiresAt" timestamp without time zone NOT NULL,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "user_id" uuid,
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "sale_items" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "sale_id" uuid NOT NULL,
                "product_id" uuid NOT NULL,
                "productCode" varchar(50),
                "productDescription" varchar(200) NOT NULL,
                "quantity" integer NOT NULL,
                "unitOfMeasure" varchar(20) NOT NULL DEFAULT 'unidades',
                "unitPrice" numeric(10,2) NOT NULL,
                "discount" numeric(10,2) NOT NULL DEFAULT '0',
                "discountPercent" numeric(5,2) NOT NULL DEFAULT '0',
                "subtotal" numeric(12,2) NOT NULL,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "sale_payments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "sale_id" uuid NOT NULL,
                "payment_method_id" uuid NOT NULL,
                "amount" numeric(12,2) NOT NULL,
                "installments" integer,
                "cardLastFourDigits" varchar(100),
                "authorizationCode" varchar(100),
                "referenceNumber" varchar(100),
                "notes" text,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "sale_taxes" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "sale_id" uuid NOT NULL,
                "name" varchar(100) NOT NULL,
                "percentage" numeric(5,2),
                "amount" numeric(12,2) NOT NULL DEFAULT '0',
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "sales" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "saleNumber" varchar(20) NOT NULL,
                "customer_id" uuid,
                "customerName" varchar(200),
                "saleDate" timestamp without time zone NOT NULL DEFAULT now(),
                "subtotal" numeric(12,2) NOT NULL DEFAULT '0',
                "discount" numeric(12,2) NOT NULL DEFAULT '0',
                "surcharge" numeric(12,2) NOT NULL DEFAULT '0',
                "tax" numeric(12,2) NOT NULL DEFAULT '0',
                "total" numeric(12,2) NOT NULL DEFAULT '0',
                "status" "sales_status_enum" NOT NULL DEFAULT 'completed',
                "isOnAccount" boolean NOT NULL DEFAULT false,
                "notes" text,
                "inventoryUpdated" boolean NOT NULL DEFAULT false,
                "isFiscal" boolean NOT NULL DEFAULT false,
                "fiscalPending" boolean NOT NULL DEFAULT false,
                "fiscalError" text,
                "created_by" uuid,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                "deletedAt" timestamp without time zone,
                "ivaPercentage" numeric(4,2),
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "stock_movements" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "productId" uuid NOT NULL,
                "type" "stock_movements_type_enum" NOT NULL,
                "source" "stock_movements_source_enum" NOT NULL DEFAULT 'ADJUSTMENT',
                "quantity" integer NOT NULL,
                "cost" numeric(10,2),
                "provider" varchar(255),
                "referenceId" varchar(255),
                "notes" text,
                "date" timestamp without time zone NOT NULL,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "product_id" uuid,
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "suppliers" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar(200) NOT NULL,
                "tradeName" varchar(200),
                "documentType" "suppliers_documenttype_enum",
                "documentNumber" varchar(50),
                "ivaCondition" "suppliers_ivacondition_enum",
                "email" varchar(255),
                "phone" varchar(50),
                "mobile" varchar(50),
                "address" varchar(255),
                "city" varchar(100),
                "state" varchar(100),
                "postalCode" varchar(20),
                "website" varchar(255),
                "contactName" varchar(100),
                "bankAccount" varchar(100),
                "notes" text,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "system_configuration" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "defaultProfitMargin" numeric(5,2) NOT NULL DEFAULT '30',
                "minStockAlert" integer NOT NULL DEFAULT 5,
                "sistemaHabilitado" boolean NOT NULL DEFAULT true,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "tax_types" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar(100) NOT NULL,
                "percentage" numeric(5,2),
                "description" varchar(255),
                "isActive" boolean NOT NULL DEFAULT true,
                PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "username" varchar(50) NOT NULL,
                "email" varchar(255),
                "passwordHash" varchar(255) NOT NULL,
                "firstName" varchar(100) NOT NULL,
                "lastName" varchar(100) NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "lastLogin" timestamp without time zone,
                "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
                "updatedAt" timestamp without time zone NOT NULL DEFAULT now(),
                PRIMARY KEY ("id")
            )
        `);

        // Foreign Keys
        await queryRunner.query(`
            ALTER TABLE "account_movements" 
            ADD CONSTRAINT "FK_7d2cd968644c5490bf50bff6709" 
            FOREIGN KEY ("paymentMethodId") 
            REFERENCES "payment_methods"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "account_movements" 
            ADD CONSTRAINT "FK_dae89f38e90f02a194f57608f5a" 
            FOREIGN KEY ("accountId") 
            REFERENCES "customer_accounts"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "account_movements" 
            ADD CONSTRAINT "FK_1329229002a091ef7fee593c08d" 
            FOREIGN KEY ("createdById") 
            REFERENCES "users"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "audit_logs" 
            ADD CONSTRAINT "FK_bd2726fd31b35443f2245b93ba0" 
            FOREIGN KEY ("user_id") 
            REFERENCES "users"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_movements" 
            ADD CONSTRAINT "FK_4a8c24eb16a7adad2154aeb1c55" 
            FOREIGN KEY ("cash_register_id") 
            REFERENCES "cash_registers"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_movements" 
            ADD CONSTRAINT "FK_3e189155db57fc4ec067ef68aa5" 
            FOREIGN KEY ("created_by") 
            REFERENCES "users"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_register_totals" 
            ADD CONSTRAINT "FK_6544b5feaa70d4a11ed6073826e" 
            FOREIGN KEY ("cash_register_id") 
            REFERENCES "cash_registers"("id") ON DELETE CASCADE
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_register_totals" 
            ADD CONSTRAINT "FK_d0c44e56ceb30e4077a292a551e" 
            FOREIGN KEY ("payment_method_id") 
            REFERENCES "payment_methods"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_registers" 
            ADD CONSTRAINT "FK_d08f513314ad93f22aa720e18ca" 
            FOREIGN KEY ("opened_by") 
            REFERENCES "users"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_registers" 
            ADD CONSTRAINT "FK_b433fa68b7d170e913c5bbeb8a6" 
            FOREIGN KEY ("closed_by") 
            REFERENCES "users"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "customer_accounts" 
            ADD CONSTRAINT "FK_faa79f189b7dff19db11e5ce6e6" 
            FOREIGN KEY ("customerId") 
            REFERENCES "customers"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "customers" 
            ADD CONSTRAINT "FK_f95c9f3263ba32c34ebb051f1f9" 
            FOREIGN KEY ("categoryId") 
            REFERENCES "customer_categories"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses" 
            ADD CONSTRAINT "FK_8a16b10452bdd176884248ce50f" 
            FOREIGN KEY ("payment_method_id") 
            REFERENCES "payment_methods"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses" 
            ADD CONSTRAINT "FK_5d1f4be708e0dfe2afa1a3c376c" 
            FOREIGN KEY ("category_id") 
            REFERENCES "expense_categories"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses" 
            ADD CONSTRAINT "FK_7c0c012c2f8e6578277c239ee61" 
            FOREIGN KEY ("created_by") 
            REFERENCES "users"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "incomes" 
            ADD CONSTRAINT "FK_24a1bf2eb3863f1335c956591ab" 
            FOREIGN KEY ("payment_method_id") 
            REFERENCES "payment_methods"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "incomes" 
            ADD CONSTRAINT "FK_314abb2175ca312302671c0609b" 
            FOREIGN KEY ("customer_id") 
            REFERENCES "customers"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "incomes" 
            ADD CONSTRAINT "FK_aa542e88dd5eaece8243e470962" 
            FOREIGN KEY ("category_id") 
            REFERENCES "income_categories"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "incomes" 
            ADD CONSTRAINT "FK_ec4353d3f033dc09ccd0d4c32fb" 
            FOREIGN KEY ("created_by") 
            REFERENCES "users"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "invoices" 
            ADD CONSTRAINT "FK_d8a00152c976a4c6a391b1eb497" 
            FOREIGN KEY ("sale_id") 
            REFERENCES "sales"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "login_audits" 
            ADD CONSTRAINT "FK_f76965bf9858a2cab885e064304" 
            FOREIGN KEY ("userId") 
            REFERENCES "users"("id") ON DELETE CASCADE
        `);
        await queryRunner.query(`
            ALTER TABLE "products" 
            ADD CONSTRAINT "FK_ff56834e735fa78a15d0cf21926" 
            FOREIGN KEY ("categoryId") 
            REFERENCES "categories"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "purchase_items" 
            ADD CONSTRAINT "FK_43694b2fa800ce38d2da9ce74d6" 
            FOREIGN KEY ("product_id") 
            REFERENCES "products"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "purchase_items" 
            ADD CONSTRAINT "FK_607211d59b13e705a673a999ab5" 
            FOREIGN KEY ("purchase_id") 
            REFERENCES "purchases"("id") ON DELETE CASCADE
        `);
        await queryRunner.query(`
            ALTER TABLE "purchases" 
            ADD CONSTRAINT "FK_70ebb313de49b0256d21b1527d4" 
            FOREIGN KEY ("created_by") 
            REFERENCES "users"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "purchases" 
            ADD CONSTRAINT "FK_96fceb0b3442b1821091a2d9715" 
            FOREIGN KEY ("payment_method_id") 
            REFERENCES "payment_methods"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "purchases" 
            ADD CONSTRAINT "FK_d5fec047f705d5b510c19379b95" 
            FOREIGN KEY ("supplier_id") 
            REFERENCES "suppliers"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "refresh_tokens" 
            ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" 
            FOREIGN KEY ("user_id") 
            REFERENCES "users"("id") ON DELETE CASCADE
        `);
        await queryRunner.query(`
            ALTER TABLE "sale_items" 
            ADD CONSTRAINT "FK_4ecae62db3f9e9cc9a368d57adb" 
            FOREIGN KEY ("product_id") 
            REFERENCES "products"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "sale_items" 
            ADD CONSTRAINT "FK_c210a330b80232c29c2ad68462a" 
            FOREIGN KEY ("sale_id") 
            REFERENCES "sales"("id") ON DELETE CASCADE
        `);
        await queryRunner.query(`
            ALTER TABLE "sale_payments" 
            ADD CONSTRAINT "FK_9c7db4fd07371a0c1eddcd1bd20" 
            FOREIGN KEY ("payment_method_id") 
            REFERENCES "payment_methods"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "sale_payments" 
            ADD CONSTRAINT "FK_0e4445597642c2456ebdd7e23b1" 
            FOREIGN KEY ("sale_id") 
            REFERENCES "sales"("id") ON DELETE CASCADE
        `);
        await queryRunner.query(`
            ALTER TABLE "sale_taxes" 
            ADD CONSTRAINT "FK_9e10f40f0530d4290b3bf5dbb82" 
            FOREIGN KEY ("sale_id") 
            REFERENCES "sales"("id") ON DELETE CASCADE
        `);
        await queryRunner.query(`
            ALTER TABLE "sales" 
            ADD CONSTRAINT "FK_83a12e5e2723eafe9a47c441457" 
            FOREIGN KEY ("created_by") 
            REFERENCES "users"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "sales" 
            ADD CONSTRAINT "FK_c51005b2b06cec7aa17462c54f5" 
            FOREIGN KEY ("customer_id") 
            REFERENCES "customers"("id")
        `);
        await queryRunner.query(`
            ALTER TABLE "stock_movements" 
            ADD CONSTRAINT "FK_2c1bb05b80ddcc562cd28d826c6" 
            FOREIGN KEY ("product_id") 
            REFERENCES "products"("id")
        `);

        // Indexes
        await queryRunner.query(`CREATE INDEX "IDX_1896ae681cf45b65c30ac4d75d" ON public.account_movements USING btree ("createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_318dacc6ac49989ce28297553a" ON public.account_movements USING btree ("movementType")`);
        await queryRunner.query(`CREATE INDEX "IDX_6f5c93a631fe50545d103f37bd" ON public.account_movements USING btree ("referenceType", "referenceId")`);
        await queryRunner.query(`CREATE INDEX "IDX_dae89f38e90f02a194f57608f5" ON public.account_movements USING btree ("accountId")`);
        await queryRunner.query(`CREATE INDEX "IDX_7421efc125d95e413657efa3c6" ON public.audit_logs USING btree (entity_type, entity_id)`);
        await queryRunner.query(`CREATE INDEX "IDX_88dcc148d532384790ab874c3d" ON public.audit_logs USING btree ("timestamp")`);
        await queryRunner.query(`CREATE INDEX "IDX_bd2726fd31b35443f2245b93ba" ON public.audit_logs USING btree (user_id)`);
        await queryRunner.query(`CREATE INDEX "IDX_cee5459245f652b75eb2759b4c" ON public.audit_logs USING btree (action)`);
        await queryRunner.query(`CREATE INDEX "IDX_8b0be371d28245da6e4f4b6187" ON public.categories USING btree (name)`);
        await queryRunner.query(`CREATE INDEX "IDX_7f67e3035731ad5aeb12af7376" ON public.customer_accounts USING btree ("daysOverdue")`);
        await queryRunner.query(`CREATE INDEX "IDX_aa4ad1331507e75eca55689ed2" ON public.customer_accounts USING btree (balance)`);
        await queryRunner.query(`CREATE INDEX "IDX_dd4af5e4a911ce718820caff37" ON public.customer_accounts USING btree (status)`);
        await queryRunner.query(`CREATE INDEX "IDX_c3a9318c56cf9f9e4eb9d1b0ef" ON public.customer_categories USING btree ("isActive")`);
        await queryRunner.query(`CREATE INDEX "IDX_ede93c8cf28e307313ec668e73" ON public.customer_categories USING btree (name)`);
        await queryRunner.query(`CREATE INDEX "IDX_40946e98ab87148f58703fa1c5" ON public.customers USING btree ("isActive")`);
        await queryRunner.query(`CREATE INDEX "IDX_8536b8b85c06969f84f0c098b0" ON public.customers USING btree (email)`);
        await queryRunner.query(`CREATE INDEX "IDX_a626a4799ae1d4f275f68ef4a2" ON public.customers USING btree ("lastName", "firstName")`);
        await queryRunner.query(`CREATE INDEX "IDX_dffea8343d90688bccac70b63a" ON public.customers USING btree ("documentNumber")`);
        await queryRunner.query(`CREATE INDEX "IDX_f95c9f3263ba32c34ebb051f1f" ON public.customers USING btree ("categoryId")`);
        await queryRunner.query(`CREATE INDEX "IDX_6bdb3db95dd955d3c701e93542" ON public.expense_categories USING btree (name)`);
        await queryRunner.query(`CREATE INDEX "IDX_36df98c0190cfafd07455a2bfc" ON public.expenses USING btree ("isPaid")`);
        await queryRunner.query(`CREATE INDEX "IDX_f52fb01c27607bb74ba05abf16" ON public.expenses USING btree ("expenseDate")`);
        await queryRunner.query(`CREATE INDEX "IDX_9bfab959a7960a323bcf1d118c" ON public.income_categories USING btree (name)`);
        await queryRunner.query(`CREATE INDEX "IDX_3a2c8e7c0b3e7d1e655f582473" ON public.incomes USING btree ("incomeDate")`);
        await queryRunner.query(`CREATE INDEX "IDX_6017a723ad7e03f5e885e4f982" ON public.incomes USING btree ("isPaid")`);
        await queryRunner.query(`CREATE INDEX "IDX_4c9fb58de893725258746385e1" ON public.products USING btree (name)`);
        await queryRunner.query(`CREATE INDEX "IDX_adfc522baf9d9b19cd7d9461b7" ON public.products USING btree (barcode)`);
        await queryRunner.query(`CREATE INDEX "IDX_ff39b9ac40872b2de41751eedc" ON public.products USING btree ("isActive")`);
        await queryRunner.query(`CREATE INDEX "IDX_ff56834e735fa78a15d0cf2192" ON public.products USING btree ("categoryId")`);
        await queryRunner.query(`CREATE INDEX "IDX_11862e6bc4363d7972bbff85bf" ON public.purchases USING btree ("purchaseDate")`);
        await queryRunner.query(`CREATE INDEX "IDX_2cb30fcfd2e6e895ffc58c3d7a" ON public.purchases USING btree ("providerName")`);
        await queryRunner.query(`CREATE INDEX "IDX_36cd9508061bebb74fb3e1a9c7" ON public.purchases USING btree (status)`);
        await queryRunner.query(`CREATE INDEX "IDX_d5fec047f705d5b510c19379b9" ON public.purchases USING btree (supplier_id)`);
        await queryRunner.query(`CREATE INDEX "IDX_4542dd2f38a61354a040ba9fd5" ON public.refresh_tokens USING btree (token)`);
        await queryRunner.query(`CREATE INDEX "IDX_56b91d98f71e3d1b649ed6e9f3" ON public.refresh_tokens USING btree ("expiresAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_12c072f5150ca7d495b07aa1c6" ON public.sales USING btree ("saleNumber")`);
        await queryRunner.query(`CREATE INDEX "IDX_65f3c52de52446c1d23ed5daf2" ON public.sales USING btree ("saleDate")`);
        await queryRunner.query(`CREATE INDEX "IDX_83e1f4b8d3b863cce4846e0295" ON public.sales USING btree (status)`);
        await queryRunner.query(`CREATE INDEX "IDX_c51005b2b06cec7aa17462c54f" ON public.sales USING btree (customer_id)`);
        await queryRunner.query(`CREATE INDEX "IDX_4827b42d37a5f169c4bf7e63f9" ON public.stock_movements USING btree (date)`);
        await queryRunner.query(`CREATE INDEX "IDX_67aceb5d7a6fa85362821b15cb" ON public.stock_movements USING btree (source)`);
        await queryRunner.query(`CREATE INDEX "IDX_a3acb59db67e977be45e382fc5" ON public.stock_movements USING btree ("productId")`);
        await queryRunner.query(`CREATE INDEX "IDX_cca7634960c09010c40b6490a1" ON public.stock_movements USING btree (type)`);
        await queryRunner.query(`CREATE INDEX "IDX_5b5720d9645cee7396595a16c9" ON public.suppliers USING btree (name)`);
        await queryRunner.query(`CREATE INDEX "IDX_66181e465a65c2ddcfa9c00c9c" ON public.suppliers USING btree (email)`);
        await queryRunner.query(`CREATE INDEX "IDX_876c06b5396f3c4acb7144ca92" ON public.suppliers USING btree ("isActive")`);
        await queryRunner.query(`CREATE INDEX "IDX_939b78561f0b4da019d2f1bdcc" ON public.suppliers USING btree ("documentNumber")`);
        await queryRunner.query(`CREATE INDEX "IDX_fe0bb3f6520ee0469504521e71" ON public.users USING btree (username)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "tax_types" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "system_configuration" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "suppliers" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "stock_movements" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "sales" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "sale_taxes" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "sale_payments" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "sale_items" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "purchases" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "purchase_items" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "products" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "payment_methods" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "login_audits" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "invoices" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "incomes" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "income_categories" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "fiscal_configuration" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "expenses" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "expense_categories" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "customers" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "customer_categories" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "customer_accounts" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "categories" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "cash_registers" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "cash_register_totals" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "cash_movements" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "backups" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "account_movements" CASCADE`);
        await queryRunner.query(`DROP TYPE IF EXISTS "suppliers_ivacondition_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "suppliers_documenttype_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "stock_movements_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "stock_movements_source_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "sales_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "purchases_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "invoices_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "fiscal_configuration_ivacondition_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "fiscal_configuration_afipenvironment_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "customers_ivacondition_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "customers_documenttype_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "customer_accounts_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "cash_registers_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "cash_movements_movementtype_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "backups_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "account_movements_movementtype_enum"`);
    }
}
