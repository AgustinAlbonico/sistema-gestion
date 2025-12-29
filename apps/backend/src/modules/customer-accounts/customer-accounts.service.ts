/**
 * Servicio de Cuentas Corrientes
 * Gestiona el CRUD de cuentas y movimientos de clientes
 */
import {
    Injectable,
    BadRequestException,
    forwardRef,
    Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { CustomerAccount, AccountStatus } from './entities/customer-account.entity';
import { AccountMovement, MovementType } from './entities/account-movement.entity';
import { CreateChargeDto, CreatePaymentDto, UpdateAccountDto, AccountFiltersDto } from './dto';
import { CustomersService } from '../customers/customers.service';
import { CashRegisterService } from '../cash-register/cash-register.service';
import { Sale, SaleStatus } from '../sales/entities/sale.entity';
import { Income } from '../incomes/entities/income.entity';

/**
 * Interfaz para estadísticas de cuentas corrientes
 */
export interface AccountStats {
    totalAccounts: number;
    activeAccounts: number;
    suspendedAccounts: number;
    totalDebtors: number;
    totalDebt: number;
    averageDebt: number;
    overdueAccounts: number;
    totalOverdue: number;
}

/**
 * Interfaz para resumen de estado de cuenta
 */
export interface AccountStatementSummary {
    totalCharges: number;
    totalPayments: number;
    currentBalance: number;
    customerPosition: 'customer_owes' | 'business_owes' | 'settled';
}

/**
 * Interfaz para alerta de deudor moroso
 */
export interface OverdueAlert {
    customerId: string;
    customerName: string;
    balance: number;
    daysOverdue: number;
    lastPaymentDate: Date | null;
}

/**
 * Respuesta paginada para cuentas
 */
export interface PaginatedAccounts {
    data: CustomerAccount[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

/**
 * Interfaz para transacciones pendientes
 */
export interface PendingTransactions {
    sales: Sale[];
    incomes: Income[];
}

@Injectable()
export class CustomerAccountsService {
    constructor(
        @InjectRepository(CustomerAccount)
        private readonly accountRepo: Repository<CustomerAccount>,
        @InjectRepository(AccountMovement)
        private readonly movementRepo: Repository<AccountMovement>,
        @InjectRepository(Sale)
        private readonly saleRepo: Repository<Sale>,
        @InjectRepository(Income)
        private readonly incomeRepo: Repository<Income>,
        private readonly customersService: CustomersService,
        @Inject(forwardRef(() => CashRegisterService))
        private readonly cashRegisterService: CashRegisterService,
        private readonly dataSource: DataSource,
    ) { }

    /**
     * Obtiene o crea una cuenta corriente para un cliente
     */
    async getOrCreateAccount(customerId: string): Promise<CustomerAccount> {
        let account = await this.accountRepo.findOne({
            where: { customerId },
            relations: ['customer'],
        });

        if (!account) {
            // Verificar que el cliente existe
            await this.customersService.findOne(customerId);

            account = this.accountRepo.create({
                customerId,
                balance: 0,
                creditLimit: 0,
                status: AccountStatus.ACTIVE,
                daysOverdue: 0,
            });

            await this.accountRepo.save(account);

            // Recargar con relaciones
            account = await this.accountRepo.findOneOrFail({
                where: { id: account.id },
                relations: ['customer'],
            });
        }

        return account;
    }

    /**
     * Crea un cargo en la cuenta (desde venta)
     */
    async createCharge(customerId: string, dto: CreateChargeDto, userId?: string): Promise<AccountMovement> {
        const account = await this.getOrCreateAccount(customerId);

        // Verificar límite de crédito
        if (account.creditLimit > 0) {
            const newBalance = Number(account.balance) + dto.amount;
            if (newBalance > account.creditLimit) {
                throw new BadRequestException(
                    `El cliente ha excedido su límite de crédito ($${account.creditLimit}). Saldo actual: $${account.balance}`
                );
            }
        }

        // Verificar si está suspendido
        if (account.status === AccountStatus.SUSPENDED) {
            throw new BadRequestException('La cuenta del cliente está suspendida. No se pueden agregar cargos.');
        }

        // Crear movimiento dentro de una transacción
        return this.dataSource.transaction(async (manager) => {
            const balanceBefore = Number(account.balance);
            const chargeAmount = Math.abs(dto.amount);
            const balanceAfter = balanceBefore + chargeAmount;

            const movement = manager.create(AccountMovement, {
                accountId: account.id,
                movementType: MovementType.CHARGE,
                amount: chargeAmount, // Positivo = débito
                balanceBefore,
                balanceAfter,
                description: dto.description,
                referenceType: dto.saleId ? 'sale' : 'manual',
                referenceId: dto.saleId || null,
                notes: dto.notes || null,
                createdById: userId || null,
            });

            await manager.save(movement);

            // Actualizar saldo de la cuenta
            account.balance = balanceAfter;
            account.lastPurchaseDate = new Date();
            await manager.save(account);

            return movement;
        });
    }

    /**
     * Registra un pago del cliente
     * Si el pago cubre toda la deuda, marca automáticamente las transacciones pendientes como completadas
     */
    async createPayment(customerId: string, dto: CreatePaymentDto, userId?: string): Promise<AccountMovement> {
        const account = await this.getOrCreateAccount(customerId);

        const currentBalance = Number(account.balance);

        // Validar que hay deuda pendiente
        if (currentBalance <= 0) {
            throw new BadRequestException('El cliente no tiene deuda pendiente');
        }

        // Validar que el pago no excede la deuda
        if (dto.amount > currentBalance) {
            throw new BadRequestException(
                `El pago ($${dto.amount}) excede la deuda pendiente ($${currentBalance})`
            );
        }

        const paymentAmount = Math.abs(dto.amount);

        // Crear movimiento dentro de una transacción
        const movement = await this.dataSource.transaction(async (manager) => {
            const balanceBefore = currentBalance;
            const balanceAfter = balanceBefore - paymentAmount;
            const isFullPayment = balanceAfter === 0;

            const newMovement = manager.create(AccountMovement, {
                accountId: account.id,
                movementType: MovementType.PAYMENT,
                amount: -paymentAmount, // Negativo = crédito
                balanceBefore,
                balanceAfter,
                description: dto.description || 'Pago recibido',
                referenceType: 'payment',
                paymentMethodId: dto.paymentMethodId,
                notes: dto.notes || null,
                createdById: userId || null,
            });

            await manager.save(newMovement);

            // Actualizar saldo de la cuenta
            account.balance = balanceAfter;
            account.lastPaymentDate = new Date();

            // Si saldo = 0, resetear días de mora y marcar transacciones como completadas
            if (isFullPayment) {
                account.daysOverdue = 0;
                if (account.status === AccountStatus.SUSPENDED) {
                    account.status = AccountStatus.ACTIVE;
                }

                // Marcar todas las ventas pendientes como COMPLETED (sin registrar en caja)
                // Usamos update directo para evitar que el cascade/hooks generen ingresos en caja
                await manager
                    .createQueryBuilder()
                    .update(Sale)
                    .set({
                        status: SaleStatus.COMPLETED,
                        isOnAccount: false
                    })
                    .where('customerId = :customerId', { customerId })
                    .andWhere('status = :status', { status: SaleStatus.PENDING })
                    .andWhere('isOnAccount = :isOnAccount', { isOnAccount: true })
                    .execute();

                // Marcar todos los ingresos pendientes como pagados
                await manager
                    .createQueryBuilder()
                    .update(Income)
                    .set({ isPaid: true })
                    .where('customerId = :customerId', { customerId })
                    .andWhere('isPaid = :isPaid', { isPaid: false })
                    .andWhere('isOnAccount = :isOnAccount', { isOnAccount: true })
                    .execute();

                console.log(`[CustomerAccounts] Pago completo de ${customerId}. Ventas e ingresos pendientes marcados como completados.`);
            }

            await manager.save(account);

            return newMovement;
        });

        // FIX Issue #2: Registrar el pago en caja de forma SÍNCRONA después de la transacción
        // Si falla, logueamos el error pero no revertimos el pago (ya está persistido)
        // Esto evita descuadres en el arqueo de caja
        try {
            await this.cashRegisterService.registerAccountPayment(
                {
                    accountMovementId: movement.id,
                    customerId,
                    amount: paymentAmount,
                    paymentMethodId: dto.paymentMethodId,
                    description: `Pago CC - ${account.customer?.firstName || 'Cliente'} ${account.customer?.lastName || ''}`.trim(),
                },
                userId || 'system',
            );
            console.log(`[CustomerAccounts] Pago registrado en caja exitosamente: $${paymentAmount}`);
        } catch (cashError) {
            // Logear error pero no revertir el pago - el movimiento ya está persistido
            console.error(`[CustomerAccounts] ERROR CRÍTICO: No se pudo registrar pago en caja: ${(cashError as Error).message}`);
            console.error(`[CustomerAccounts] El pago ID ${movement.id} debe registrarse manualmente en caja`);
        }

        return movement;
    }

    /**
     * Aplica un recargo (interés) a la cuenta del cliente
     * El recargo puede ser porcentual (sobre el saldo actual) o fijo
     */
    async applySurcharge(
        customerId: string,
        dto: { surchargeType: 'percentage' | 'fixed'; value: number; description?: string },
        userId?: string,
    ): Promise<AccountMovement> {
        const account = await this.getOrCreateAccount(customerId);
        const currentBalance = Number(account.balance);

        // Validar que hay deuda pendiente
        if (currentBalance <= 0) {
            throw new BadRequestException('El cliente no tiene deuda pendiente para aplicar recargo');
        }

        // Calcular el monto del recargo
        let surchargeAmount: number;
        let description: string;

        if (dto.surchargeType === 'percentage') {
            surchargeAmount = Math.round((currentBalance * (dto.value / 100)) * 100) / 100; // Redondear a 2 decimales
            description = dto.description || `Recargo por mora (${dto.value}%)`;
        } else {
            surchargeAmount = dto.value;
            description = dto.description || `Recargo por mora ($${dto.value.toFixed(2)})`;
        }

        // Crear movimiento dentro de una transacción
        return this.dataSource.transaction(async (manager) => {
            const balanceBefore = currentBalance;
            const balanceAfter = balanceBefore + surchargeAmount;

            const movement = manager.create(AccountMovement, {
                accountId: account.id,
                movementType: MovementType.INTEREST,
                amount: surchargeAmount, // Positivo = débito
                balanceBefore,
                balanceAfter,
                description,
                referenceType: 'surcharge',
                notes: dto.surchargeType === 'percentage'
                    ? `Porcentaje aplicado: ${dto.value}% sobre saldo de $${balanceBefore.toFixed(2)}`
                    : `Monto fijo aplicado`,
                createdById: userId || null,
            });

            await manager.save(movement);

            // Actualizar saldo de la cuenta
            account.balance = balanceAfter;
            await manager.save(account);

            return movement;
        });
    }

    /**
     * Obtiene el estado de cuenta de un cliente
     */
    async getAccountStatement(customerId: string) {
        const account = await this.getOrCreateAccount(customerId);

        const movements = await this.movementRepo.find({
            where: { accountId: account.id },
            relations: ['createdBy', 'paymentMethod'],
            order: { createdAt: 'DESC' },
        });

        // Calcular totales
        const totalCharges = movements
            .filter(m => m.movementType === MovementType.CHARGE)
            .reduce((sum, m) => sum + Number(m.amount), 0);

        const totalPayments = movements
            .filter(m => m.movementType === MovementType.PAYMENT)
            .reduce((sum, m) => sum + Math.abs(Number(m.amount)), 0);

        const currentBalance = Number(account.balance);

        const summary: AccountStatementSummary = {
            totalCharges,
            totalPayments,
            currentBalance,
            customerPosition: this.getCustomerPosition(currentBalance),
        };

        return {
            account,
            movements,
            summary,
        };
    }

    /**
     * Lista todas las cuentas con filtros y paginación
     */
    async findAll(filters: AccountFiltersDto = {}): Promise<PaginatedAccounts> {
        const { page = 1, limit = 10, status, hasDebt, isOverdue, search } = filters;
        const skip = (page - 1) * limit;

        const query = this.accountRepo.createQueryBuilder('account')
            .leftJoinAndSelect('account.customer', 'customer')
            .orderBy('account.balance', 'DESC');

        if (status) {
            query.andWhere('account.status = :status', { status });
        }

        if (hasDebt) {
            query.andWhere('account.balance > 0');
        }

        if (isOverdue) {
            query.andWhere('account.daysOverdue > 0');
        }

        if (search) {
            query.andWhere(
                '(customer.firstName ILIKE :search OR customer.lastName ILIKE :search)',
                { search: `%${search}%` }
            );
        }

        const [data, total] = await query
            .skip(skip)
            .take(limit)
            .getManyAndCount();

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Obtiene lista de clientes deudores
     */
    async getDebtors(): Promise<CustomerAccount[]> {
        return this.accountRepo.find({
            where: { balance: MoreThan(0) },
            relations: ['customer'],
            order: { balance: 'DESC' },
        });
    }

    /**
     * Actualiza límite de crédito y/o estado de una cuenta
     */
    async updateAccount(customerId: string, dto: UpdateAccountDto): Promise<CustomerAccount> {
        const account = await this.getOrCreateAccount(customerId);

        if (dto.creditLimit !== undefined) {
            account.creditLimit = dto.creditLimit;
        }

        if (dto.status !== undefined) {
            account.status = dto.status;
        }

        return this.accountRepo.save(account);
    }

    /**
     * Suspende la cuenta de un cliente
     */
    async suspendAccount(customerId: string): Promise<CustomerAccount> {
        const account = await this.getOrCreateAccount(customerId);
        account.status = AccountStatus.SUSPENDED;
        return this.accountRepo.save(account);
    }

    /**
     * Reactiva la cuenta de un cliente
     */
    async activateAccount(customerId: string): Promise<CustomerAccount> {
        const account = await this.getOrCreateAccount(customerId);
        account.status = AccountStatus.ACTIVE;
        return this.accountRepo.save(account);
    }

    /**
     * Obtiene estadísticas globales de cuentas corrientes
     */
    async getStats(): Promise<AccountStats> {
        const accounts = await this.accountRepo.find({
            relations: ['customer'],
        });

        const debtors = accounts.filter(a => Number(a.balance) > 0);
        const totalDebt = debtors.reduce((sum, a) => sum + Number(a.balance), 0);
        const overdueAccounts = accounts.filter(a => a.daysOverdue > 0);
        const totalOverdue = overdueAccounts.reduce((sum, a) => sum + Number(a.balance), 0);

        return {
            totalAccounts: accounts.length,
            activeAccounts: accounts.filter(a => a.status === AccountStatus.ACTIVE).length,
            suspendedAccounts: accounts.filter(a => a.status === AccountStatus.SUSPENDED).length,
            totalDebtors: debtors.length,
            totalDebt,
            averageDebt: debtors.length > 0 ? totalDebt / debtors.length : 0,
            overdueAccounts: overdueAccounts.length,
            totalOverdue,
        };
    }

    /**
     * Obtiene alertas de deudores morosos
     * (para mostrar al inicio de cada mes)
     */
    async getOverdueAlerts(): Promise<OverdueAlert[]> {
        const overdueAccounts = await this.accountRepo.find({
            where: {
                balance: MoreThan(0),
                daysOverdue: MoreThan(0),
            },
            relations: ['customer'],
            order: { daysOverdue: 'DESC' },
        });

        return overdueAccounts.map(account => ({
            customerId: account.customerId,
            customerName: account.customer
                ? `${account.customer.firstName} ${account.customer.lastName}`
                : 'Cliente desconocido',
            balance: Number(account.balance),
            daysOverdue: account.daysOverdue,
            lastPaymentDate: account.lastPaymentDate,
        }));
    }

    /**
     * Actualiza días de mora de todas las cuentas
     * Se ejecuta automáticamente todos los días a las 3:00 AM
     */
    @Cron('0 3 * * *') // 3:00 AM todos los días
    async updateOverdueDays(): Promise<void> {
        console.log('[CustomerAccounts] Actualizando días de mora...');

        const accounts = await this.accountRepo.find({
            where: { balance: MoreThan(0) },
            relations: ['movements'],
        });

        for (const account of accounts) {
            // Buscar último cargo
            const charges = account.movements
                .filter(m => m.movementType === MovementType.CHARGE)
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

            const lastCharge = charges[0];

            if (lastCharge) {
                const daysSinceCharge = Math.floor(
                    (Date.now() - lastCharge.createdAt.getTime()) / (1000 * 60 * 60 * 24)
                );

                account.daysOverdue = daysSinceCharge;

                // Suspender automáticamente si más de 30 días de mora
                if (daysSinceCharge > 30 && account.status === AccountStatus.ACTIVE) {
                    account.status = AccountStatus.SUSPENDED;
                    console.log(`[CustomerAccounts] Cuenta ${account.id} suspendida por mora (${daysSinceCharge} días)`);
                }

                await this.accountRepo.save(account);
            }
        }

        console.log(`[CustomerAccounts] Actualizadas ${accounts.length} cuentas`);
    }

    /**
     * Verifica deudores morosos al inicio de cada mes
     * Se ejecuta el día 1 de cada mes a las 8:00 AM
     */
    @Cron('0 8 1 * *') // 8:00 AM del día 1 de cada mes
    async checkOverdueAccountsMonthly(): Promise<void> {
        console.log('[CustomerAccounts] Verificación mensual de morosos...');

        const overdueAlerts = await this.getOverdueAlerts();

        if (overdueAlerts.length > 0) {
            console.log(`[CustomerAccounts] Hay ${overdueAlerts.length} clientes morosos:`);
            overdueAlerts.forEach(alert => {
                console.log(`  - ${alert.customerName}: $${alert.balance} (${alert.daysOverdue} días de mora)`);
            });
        } else {
            console.log('[CustomerAccounts] No hay clientes morosos');
        }
    }

    /**
     * Determina la posición del cliente según el balance
     */
    private getCustomerPosition(balance: number): 'customer_owes' | 'business_owes' | 'settled' {
        if (balance > 0) return 'customer_owes';
        if (balance < 0) return 'business_owes';
        return 'settled';
    }

    /**
     * Obtiene las transacciones pendientes de un cliente (ventas e ingresos a cuenta corriente sin pagar)
     */
    async getPendingTransactions(customerId: string): Promise<PendingTransactions> {
        // Obtener ventas pendientes (status PENDING) del cliente
        const sales = await this.saleRepo.find({
            where: {
                customerId,
                status: SaleStatus.PENDING,
                isOnAccount: true,
            },
            relations: ['items', 'items.product', 'customer'],
            order: { saleDate: 'DESC' },
        });

        // Obtener ingresos pendientes (isPaid = false y isOnAccount = true) del cliente
        const incomes = await this.incomeRepo.find({
            where: {
                customerId,
                isPaid: false,
                isOnAccount: true,
            },
            relations: ['category', 'customer'],
            order: { incomeDate: 'DESC' },
        });

        return { sales, incomes };
    }

    /**
     * Sincroniza cargos faltantes de ventas a cuenta corriente que nunca se registraron
     * Retorna la cantidad de cargos creados y el monto total
     */
    async syncMissingCharges(customerId: string, userId?: string): Promise<{
        chargesCreated: number;
        totalAmount: number;
        sales: Array<{ saleId: string; saleNumber: string; amount: number }>;
    }> {
        const account = await this.getOrCreateAccount(customerId);

        // Obtener ventas pendientes a cuenta corriente
        const pendingSales = await this.saleRepo.find({
            where: {
                customerId,
                status: SaleStatus.PENDING,
                isOnAccount: true,
            },
            order: { saleDate: 'ASC' }, // Ordenar por fecha para mantener cronología correcta
        });

        // Obtener IDs de ventas que YA tienen un cargo registrado
        const existingCharges = await this.movementRepo.find({
            where: {
                accountId: account.id,
                movementType: MovementType.CHARGE,
                referenceType: 'sale',
            },
            select: ['referenceId'],
        });

        const registeredSaleIds = new Set(existingCharges.map(m => m.referenceId));

        // Filtrar ventas que NO tienen cargo
        const salesWithoutCharge = pendingSales.filter(sale => !registeredSaleIds.has(sale.id));

        if (salesWithoutCharge.length === 0) {
            return { chargesCreated: 0, totalAmount: 0, sales: [] };
        }

        // Crear cargos para las ventas faltantes dentro de una transacción
        const result = await this.dataSource.transaction(async (manager) => {
            let currentBalance = Number(account.balance);
            const createdCharges: Array<{ saleId: string; saleNumber: string; amount: number }> = [];

            for (const sale of salesWithoutCharge) {
                const chargeAmount = Number(sale.total);
                const balanceBefore = currentBalance;
                const balanceAfter = currentBalance + chargeAmount;

                // Crear el movimiento de cargo
                const movement = manager.create(AccountMovement, {
                    accountId: account.id,
                    movementType: MovementType.CHARGE,
                    amount: chargeAmount,
                    balanceBefore,
                    balanceAfter,
                    description: `Venta ${sale.saleNumber}`,
                    referenceType: 'sale',
                    referenceId: sale.id,
                    notes: 'Cargo generado por sincronización de datos históricos',
                    createdById: userId || null,
                });

                await manager.save(movement);

                currentBalance = balanceAfter;
                createdCharges.push({
                    saleId: sale.id,
                    saleNumber: sale.saleNumber,
                    amount: chargeAmount,
                });
            }

            // Actualizar el saldo final de la cuenta
            account.balance = currentBalance;
            await manager.save(account);

            return createdCharges;
        });

        const totalAmount = result.reduce((sum, c) => sum + c.amount, 0);

        console.log(`[CustomerAccounts] Sincronizados ${result.length} cargos para cliente ${customerId}. Total: $${totalAmount}`);

        return {
            chargesCreated: result.length,
            totalAmount,
            sales: result,
        };
    }

    /**
     * Revierte el cargo de una venta cuando se cancela (Issue #5)
     * Crea un movimiento de ajuste como crédito al cliente
     * @param saleId - ID de la venta cancelada
     * @param userId - Usuario que realiza la reversión
     * @returns true si se revirtió un cargo, false si no había cargo para revertir
     */
    async revertChargeBySaleId(saleId: string, userId?: string): Promise<boolean> {
        // Buscar el movimiento de cargo original de esta venta
        const originalCharge = await this.movementRepo.findOne({
            where: {
                referenceType: 'sale',
                referenceId: saleId,
                movementType: MovementType.CHARGE,
            },
            relations: ['account'],
        });

        if (!originalCharge) {
            console.log(`[CustomerAccounts] No se encontró cargo para revertir de venta ${saleId}`);
            return false;
        }

        const account = originalCharge.account;
        const chargeAmount = Math.abs(Number(originalCharge.amount));

        return this.dataSource.transaction(async (manager) => {
            const currentBalance = Number(account.balance);
            const balanceAfter = currentBalance - chargeAmount;

            // Crear movimiento de ajuste (crédito al cliente)
            const reversal = manager.create(AccountMovement, {
                accountId: account.id,
                movementType: MovementType.ADJUSTMENT,
                amount: -chargeAmount, // Negativo = crédito al cliente
                balanceBefore: currentBalance,
                balanceAfter,
                description: `Reversión por cancelación de venta`,
                referenceType: 'sale_cancellation',
                referenceId: saleId,
                notes: `Reversión automática del cargo original ID: ${originalCharge.id}`,
                createdById: userId || null,
            });

            await manager.save(reversal);

            // Actualizar saldo de la cuenta
            account.balance = balanceAfter;
            await manager.save(account);

            console.log(`[CustomerAccounts] Cargo revertido para venta ${saleId}. Monto: $${chargeAmount}`);
            return true;
        });
    }
}

