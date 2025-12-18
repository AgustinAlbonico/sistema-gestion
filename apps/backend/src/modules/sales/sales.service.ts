/**
 * Servicio de Ventas
 * Gestiona el CRUD de ventas con integración a inventario
 */
import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Like, EntityManager, SelectQueryBuilder } from 'typeorm';
import { Sale, SaleStatus } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SalePayment } from './entities/sale-payment.entity';
import { SaleTax } from './entities/sale-tax.entity';
import {
    CreateSaleDto,
    UpdateSaleDto,
    SaleFiltersDto,
} from './dto';
import { InventoryService } from '../inventory/inventory.service';
import { ProductsService } from '../products/products.service';
import { InvoiceService } from './services/invoice.service';
import { CashRegisterService } from '../cash-register/cash-register.service';
import { CustomerAccountsService } from '../customer-accounts/customer-accounts.service';
import { StockMovementType, StockMovementSource } from '../inventory/entities/stock-movement.entity';
import { parseLocalDate } from '../../common/utils/date.utils';
import { AuditService } from '../audit/audit.service';
import { AuditEntityType, AuditAction } from '../audit/enums';
import { PaymentDto } from '../auth/interfaces';

export interface SaleStats {
    totalSales: number;
    totalAmount: number;
    totalCompleted: number;
    totalPending: number;
    salesByStatus: Record<SaleStatus, number>;
    salesByPaymentMethod: Record<string, number>;
}

export interface PaginatedSales {
    data: Sale[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

@Injectable()
export class SalesService {
    constructor(
        @InjectRepository(Sale)
        private readonly saleRepo: Repository<Sale>,
        @InjectRepository(SaleItem)
        private readonly saleItemRepo: Repository<SaleItem>,
        @InjectRepository(SalePayment)
        private readonly salePaymentRepo: Repository<SalePayment>,
        @InjectRepository(SaleTax)
        private readonly saleTaxRepo: Repository<SaleTax>,
        private readonly inventoryService: InventoryService,
        private readonly productsService: ProductsService,
        private readonly invoiceService: InvoiceService,
        private readonly cashRegisterService: CashRegisterService,
        private readonly customerAccountsService: CustomerAccountsService,
        private readonly dataSource: DataSource,
        private readonly auditService: AuditService,
    ) { }

    // ============ Métodos auxiliares para reducir complejidad cognitiva ============

    /**
     * Valida que todos los productos existan y tengan stock suficiente
     */
    private async validateProductsStock(items: CreateSaleDto['items']): Promise<void> {
        for (const item of items) {
            const product = await this.productsService.findOne(item.productId);
            if (!product) {
                throw new NotFoundException(`Producto con ID ${item.productId} no encontrado`);
            }
            if (product.stock < item.quantity) {
                throw new BadRequestException(
                    `Stock insuficiente para "${product.name}". Disponible: ${product.stock}, Solicitado: ${item.quantity}`
                );
            }
        }
    }

    /**
     * Calcula los totales de la venta (subtotal, impuestos, total)
     */
    private calculateSaleTotals(dto: CreateSaleDto): { subtotal: number; totalTax: number; total: number } {
        const subtotal = dto.items.reduce(
            (sum, item) => sum + item.quantity * item.unitPrice - (item.discount || 0),
            0
        );

        let totalTax = dto.tax || 0;
        if (dto.taxes && dto.taxes.length > 0) {
            totalTax = dto.taxes.reduce((sum, tax) => sum + tax.amount, 0);
        }

        const total = subtotal + totalTax - (dto.discount || 0) + (dto.surcharge || 0);

        return { subtotal, totalTax, total };
    }

    /**
     * Determina el estado inicial de la venta
     */
    private determineSaleStatus(dto: CreateSaleDto): SaleStatus {
        if (dto.isOnAccount) {
            return SaleStatus.PENDING;
        }
        return dto.status ?? SaleStatus.COMPLETED;
    }

    /**
     * Valida que los pagos cubran el total (si no es cuenta corriente)
     */
    private validatePayments(dto: CreateSaleDto, total: number): void {
        if (!dto.isOnAccount && dto.payments) {
            const totalPayments = dto.payments.reduce((sum, p) => sum + p.amount, 0);
            if (Math.abs(totalPayments - total) > 0.01) {
                throw new BadRequestException(
                    `El total de pagos ($${totalPayments.toFixed(2)}) no coincide con el total de la venta ($${total.toFixed(2)})`
                );
            }
        }
    }

    /**
     * Crea los items de la venta
     */
    private async createSaleItems(
        manager: EntityManager,
        saleId: string,
        items: CreateSaleDto['items']
    ): Promise<void> {
        for (const itemDto of items) {
            const product = await this.productsService.findOne(itemDto.productId);
            const item = this.saleItemRepo.create({
                saleId,
                productId: itemDto.productId,
                productCode: product.sku ?? null,
                productDescription: product.name,
                quantity: itemDto.quantity,
                unitPrice: itemDto.unitPrice,
                discount: itemDto.discount ?? 0,
                discountPercent: itemDto.discountPercent ?? 0,
                subtotal: (itemDto.quantity * itemDto.unitPrice) - (itemDto.discount || 0),
            });
            await manager.save(item);
        }
    }

    /**
     * Crea los impuestos de la venta
     */
    private async createSaleTaxes(
        manager: EntityManager,
        saleId: string,
        taxes: CreateSaleDto['taxes']
    ): Promise<void> {
        if (!taxes || taxes.length === 0) return;

        for (const taxDto of taxes) {
            const tax = this.saleTaxRepo.create({
                saleId,
                name: taxDto.name,
                percentage: taxDto.percentage ?? null,
                amount: taxDto.amount,
            });
            await manager.save(tax);
        }
    }

    /**
     * Crea los pagos de la venta
     */
    private async createSalePayments(
        manager: EntityManager,
        saleId: string,
        payments: CreateSaleDto['payments']
    ): Promise<void> {
        if (!payments || payments.length === 0) return;

        for (const paymentDto of payments) {
            const payment = this.salePaymentRepo.create({
                saleId,
                paymentMethodId: paymentDto.paymentMethodId,
                amount: paymentDto.amount,
                installments: paymentDto.installments ?? null,
                cardLastFourDigits: paymentDto.cardLastFourDigits ?? null,
                authorizationCode: paymentDto.authorizationCode ?? null,
                referenceNumber: paymentDto.referenceNumber ?? null,
                notes: paymentDto.notes ?? null,
            });
            await manager.save(payment);
        }
    }

    /**
     * Registra los ingresos en caja para los pagos de la venta
     */
    private async registerCashIncomes(
        payments: SalePayment[],
        userId: string
    ): Promise<void> {
        for (const payment of payments) {
            try {
                await this.cashRegisterService.registerIncome(
                    { salePaymentId: payment.id },
                    userId || 'system'
                );
                console.log(`[Ventas] Ingreso registrado en caja: ${payment.amount} (${payment.paymentMethodId})`);
            } catch (error_) {
                console.warn(`[Ventas] No se pudo registrar ingreso en caja: ${(error_ as Error).message}`);
            }
        }
    }

    // ============ Métodos públicos ============

    /**
     * Crea una nueva venta
     */
    async create(dto: CreateSaleDto, userId?: string): Promise<Sale> {
        // Validar que haya caja abierta antes de crear la venta
        const openCashRegister = await this.cashRegisterService.getOpenRegister();
        if (!openCashRegister) {
            throw new BadRequestException(
                'No hay caja abierta. Debe abrir la caja antes de registrar ventas.'
            );
        }

        // Validar productos y stock
        await this.validateProductsStock(dto.items);

        // Calcular totales
        const { subtotal, totalTax, total } = this.calculateSaleTotals(dto);

        // Determinar estado
        const status = this.determineSaleStatus(dto);

        // Validar pagos
        this.validatePayments(dto, total);

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Generar número de venta
            const saleNumber = await this.generateSaleNumber();

            // Crear venta
            const sale = this.saleRepo.create({
                saleNumber,
                customerId: dto.customerId ?? null,
                customerName: dto.customerName ?? null,
                saleDate: dto.saleDate ? parseLocalDate(dto.saleDate) : new Date(),
                subtotal,
                discount: dto.discount ?? 0,
                surcharge: dto.surcharge ?? 0,
                tax: totalTax,
                total,
                status,
                isOnAccount: dto.isOnAccount ?? false,
                notes: dto.notes ?? null,
                createdById: userId ?? null,
            });

            const savedSale = await queryRunner.manager.save(sale);

            // Crear items, impuestos y pagos usando funciones auxiliares
            await this.createSaleItems(queryRunner.manager, savedSale.id, dto.items);
            await this.createSaleTaxes(queryRunner.manager, savedSale.id, dto.taxes);
            await this.createSalePayments(queryRunner.manager, savedSale.id, dto.payments);

            // Actualizar inventario siempre que la venta no esté cancelada
            // (las ventas en cuenta corriente también deben descontar stock)
            if (status !== SaleStatus.CANCELLED) {
                await this.updateInventoryFromSale(savedSale.id, queryRunner.manager);
                savedSale.inventoryUpdated = true;
                await queryRunner.manager.save(savedSale);
            }

            // Si es venta a cuenta corriente, registrar cargo en cuenta del cliente
            if (dto.isOnAccount && dto.customerId) {
                console.log(`[Ventas] Registrando cargo en cuenta corriente del cliente ${dto.customerId}...`);
                await this.customerAccountsService.createCharge(
                    dto.customerId,
                    {
                        amount: total,
                        description: `Venta ${saleNumber}`,
                        saleId: savedSale.id,
                        notes: dto.notes || undefined,
                    },
                    userId
                );
                console.log(`[Ventas] Cargo registrado exitosamente: $${total}`);
            }

            // Cargar venta completa con todas sus relaciones ANTES del commit
            let completedSale = await queryRunner.manager.findOne(Sale, {
                where: { id: savedSale.id },
                relations: ['items', 'items.product', 'payments', 'customer', 'createdBy', 'invoice'],
            });

            // Generar factura si se solicitó
            if (dto.generateInvoice && completedSale) {
                console.log(`[Ventas] Generando factura fiscal para venta ${savedSale.id}...`);
                try {
                    await this.invoiceService.generateInvoice(savedSale.id, queryRunner.manager);
                    completedSale = await queryRunner.manager.findOne(Sale, {
                        where: { id: savedSale.id },
                        relations: ['items', 'items.product', 'payments', 'customer', 'createdBy', 'invoice'],
                    });
                } catch (error_) {
                    const errorMsg = (error_ as Error).message;
                    console.error(`[Ventas] Error al generar factura fiscal: ${errorMsg}`);
                    savedSale.fiscalPending = true;
                    savedSale.fiscalError = errorMsg;
                    await queryRunner.manager.save(savedSale);
                    completedSale = await queryRunner.manager.findOne(Sale, {
                        where: { id: savedSale.id },
                        relations: ['items', 'items.product', 'payments', 'customer', 'createdBy', 'invoice'],
                    });
                }
            }

            await queryRunner.commitTransaction();

            // Registrar ingresos en caja (después del commit)
            if (status === SaleStatus.COMPLETED && completedSale?.payments && completedSale.payments.length > 0) {
                await this.registerCashIncomes(completedSale.payments, userId || 'system');
            }

            // Log de auditoría para creación de venta
            if (userId && completedSale) {
                await this.auditService.logSilent({
                    entityType: AuditEntityType.SALE,
                    entityId: completedSale.id,
                    action: AuditAction.CREATE,
                    userId,
                    newValues: {
                        saleNumber: completedSale.saleNumber,
                        total: completedSale.total,
                        status: completedSale.status,
                        customerId: completedSale.customerId,
                        isOnAccount: completedSale.isOnAccount,
                        isFiscal: completedSale.isFiscal,
                    },
                    description: AuditService.generateDescription(
                        AuditAction.CREATE,
                        AuditEntityType.SALE,
                        completedSale.saleNumber
                    ),
                });
            }

            return completedSale!;
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Aplica filtros de estado de facturación al query
     */
    private applyInvoiceStatusFilter(query: SelectQueryBuilder<Sale>, invoiceStatus: string): void {
        switch (invoiceStatus) {
            case 'fiscal':
                query.andWhere('sale.isFiscal = :isFiscal', { isFiscal: true });
                break;
            case 'no_fiscal':
                query.andWhere('sale.isFiscal = :isFiscal', { isFiscal: false });
                query.andWhere('(sale.fiscalPending IS NULL OR sale.fiscalPending = :fiscalPending)',
                    { fiscalPending: false });
                break;
            case 'error':
                query.andWhere('sale.fiscalPending = :fiscalPending', { fiscalPending: true });
                query.andWhere('sale.isFiscal = :isFiscal', { isFiscal: false });
                break;
            case 'pending':
                query.andWhere('invoice.status = :invoiceStatus', { invoiceStatus: 'pending' });
                break;
        }
    }

    /**
     * Aplica filtros de fecha al query de ventas
     */
    private applyDateFilters(query: SelectQueryBuilder<Sale>, startDate?: string, endDate?: string): void {
        if (startDate && endDate) {
            query.andWhere('DATE(sale.saleDate) BETWEEN :start AND :end', { start: startDate, end: endDate });
        } else if (startDate) {
            query.andWhere('DATE(sale.saleDate) >= :start', { start: startDate });
        } else if (endDate) {
            query.andWhere('DATE(sale.saleDate) <= :end', { end: endDate });
        }
    }

    /**
     * Aplica filtros básicos de búsqueda al query de ventas
     */
    private applySearchFilters(query: SelectQueryBuilder<Sale>, filters: SaleFiltersDto): void {
        if (filters.search) {
            query.andWhere(
                '(sale.saleNumber ILIKE :search OR sale.customerName ILIKE :search OR customer.firstName ILIKE :search OR customer.lastName ILIKE :search)',
                { search: `%${filters.search}%` }
            );
        }
        if (filters.status) {
            query.andWhere('sale.status = :status', { status: filters.status });
        }
        if (filters.customerId) {
            query.andWhere('sale.customerId = :customerId', { customerId: filters.customerId });
        }
        if (filters.productId) {
            query.andWhere('items.productId = :productId', { productId: filters.productId });
        }
        if (filters.fiscalPending !== undefined) {
            query.andWhere('sale.fiscalPending = :fiscalPending', { fiscalPending: filters.fiscalPending });
        }
    }

    /**
     * Obtiene ventas con filtros y paginación
     */
    async findAll(filters: SaleFiltersDto): Promise<PaginatedSales> {
        const page = filters.page ?? 1;
        const limit = filters.limit ?? 10;
        const skip = (page - 1) * limit;

        const query = this.saleRepo
            .createQueryBuilder('sale')
            .leftJoinAndSelect('sale.items', 'items')
            .leftJoinAndSelect('items.product', 'product')
            .leftJoinAndSelect('sale.payments', 'payments')
            .leftJoinAndSelect('payments.paymentMethod', 'paymentMethod')
            .leftJoinAndSelect('sale.customer', 'customer')
            .leftJoinAndSelect('sale.createdBy', 'user')
            .leftJoinAndSelect('sale.invoice', 'invoice')
            .where('sale.deletedAt IS NULL');

        // Aplicar filtros usando funciones auxiliares
        this.applySearchFilters(query, filters);
        this.applyDateFilters(query, filters.startDate, filters.endDate);

        // Filtro por estado de facturación
        if (filters.invoiceStatus) {
            this.applyInvoiceStatusFilter(query, filters.invoiceStatus);
        }

        // Ordenamiento
        const sortBy = filters.sortBy ?? 'saleNumber';
        const order = filters.order ?? 'DESC';
        query.orderBy(`sale.${sortBy}`, order);

        // Obtener total y datos paginados
        const [data, total] = await query.skip(skip).take(limit).getManyAndCount();

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Obtiene una venta por ID
     */
    async findOne(id: string): Promise<Sale> {
        const sale = await this.saleRepo.findOne({
            where: { id },
            relations: ['items', 'items.product', 'payments', 'payments.paymentMethod', 'customer', 'createdBy', 'invoice'],
        });

        if (!sale) {
            throw new NotFoundException(`Venta con ID ${id} no encontrada`);
        }

        return sale;
    }

    /**
     * Actualiza una venta
     */
    async update(id: string, dto: UpdateSaleDto, userId?: string): Promise<Sale> {
        const sale = await this.findOne(id);
        const previousValues = {
            customerId: sale.customerId,
            customerName: sale.customerName,
            notes: sale.notes,
            isOnAccount: sale.isOnAccount,
            tax: sale.tax,
            discount: sale.discount,
            surcharge: sale.surcharge,
            total: sale.total,
            status: sale.status,
        };

        if (sale.status === SaleStatus.CANCELLED) {
            throw new BadRequestException('No se puede modificar una venta cancelada');
        }

        if (sale.inventoryUpdated) {
            throw new BadRequestException('No se puede modificar una venta que ya actualizó el inventario');
        }

        // Actualizar campos
        if (dto.customerId !== undefined) sale.customerId = dto.customerId ?? null;
        if (dto.customerName !== undefined) sale.customerName = dto.customerName ?? null;
        if (dto.notes !== undefined) sale.notes = dto.notes ?? null;
        if (dto.isOnAccount !== undefined) sale.isOnAccount = dto.isOnAccount;

        // Actualizar impuesto/descuento y recalcular total
        if (dto.tax !== undefined) sale.tax = dto.tax;
        if (dto.discount !== undefined) sale.discount = dto.discount;
        if (dto.surcharge !== undefined) sale.surcharge = dto.surcharge;
        sale.total = sale.subtotal + sale.tax - sale.discount + sale.surcharge;

        if (dto.status !== undefined) sale.status = dto.status;

        await this.saleRepo.save(sale);

        // Log de auditoría
        if (userId) {
            await this.auditService.logSilent({
                entityType: AuditEntityType.SALE,
                entityId: id,
                action: AuditAction.UPDATE,
                userId,
                previousValues,
                newValues: {
                    customerId: sale.customerId,
                    customerName: sale.customerName,
                    notes: sale.notes,
                    isOnAccount: sale.isOnAccount,
                    tax: sale.tax,
                    discount: sale.discount,
                    surcharge: sale.surcharge,
                    total: sale.total,
                    status: sale.status,
                },
                description: AuditService.generateDescription(
                    AuditAction.UPDATE,
                    AuditEntityType.SALE,
                    sale.saleNumber
                ),
            });
        }

        return this.findOne(id);
    }

    /**
     * Cancela una venta
     */
    async cancel(id: string, userId?: string): Promise<Sale> {
        const sale = await this.findOne(id);
        const previousStatus = sale.status;

        if (sale.status === SaleStatus.CANCELLED) {
            throw new BadRequestException('La venta ya está cancelada');
        }

        // Si ya se actualizó el inventario, revertir
        if (sale.inventoryUpdated) {
            await this.revertInventoryFromSale(sale);
            sale.inventoryUpdated = false;
        }

        sale.status = SaleStatus.CANCELLED;
        const savedSale = await this.saleRepo.save(sale);

        // Log de auditoría
        if (userId) {
            await this.auditService.logSilent({
                entityType: AuditEntityType.SALE,
                entityId: id,
                action: AuditAction.CANCEL,
                userId,
                previousValues: { status: previousStatus },
                newValues: { status: SaleStatus.CANCELLED },
                description: AuditService.generateDescription(
                    AuditAction.CANCEL,
                    AuditEntityType.SALE,
                    sale.saleNumber
                ),
            });
        }

        return savedSale;
    }

    /**
     * Elimina una venta (soft delete)
     */
    async remove(id: string, userId?: string): Promise<{ message: string }> {
        const sale = await this.findOne(id);

        if (sale.inventoryUpdated) {
            throw new BadRequestException(
                'No se puede eliminar una venta que ya actualizó el inventario. Cancélela primero.'
            );
        }

        await this.saleRepo.softDelete(id);

        // Log de auditoría
        if (userId) {
            await this.auditService.logSilent({
                entityType: AuditEntityType.SALE,
                entityId: id,
                action: AuditAction.DELETE,
                userId,
                previousValues: {
                    saleNumber: sale.saleNumber,
                    total: sale.total,
                    status: sale.status,
                },
                description: AuditService.generateDescription(
                    AuditAction.DELETE,
                    AuditEntityType.SALE,
                    sale.saleNumber
                ),
            });
        }

        return { message: 'Venta eliminada' };
    }

    /**
     * Marca una venta pendiente como pagada
     */
    async markAsPaid(id: string, payments: PaymentDto[], userId?: string): Promise<Sale> {
        const sale = await this.findOne(id);

        if (sale.status === SaleStatus.CANCELLED) {
            throw new BadRequestException('No se puede pagar una venta cancelada');
        }

        if (sale.status === SaleStatus.COMPLETED) {
            throw new BadRequestException('La venta ya está completada');
        }

        // Validar que haya caja abierta
        const openCashRegister = await this.cashRegisterService.getOpenRegister();
        if (!openCashRegister) {
            throw new BadRequestException(
                'No hay caja abierta. Debe abrir la caja antes de marcar ventas como pagadas.',
            );
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Crear pagos
            const savedPayments: SalePayment[] = [];
            for (const paymentDto of payments) {
                const payment = this.salePaymentRepo.create({
                    saleId: sale.id,
                    paymentMethodId: paymentDto.paymentMethodId,
                    amount: paymentDto.amount,
                    installments: paymentDto.installments ?? null,
                    cardLastFourDigits: paymentDto.cardLastFourDigits ?? null,
                    authorizationCode: paymentDto.authorizationCode ?? null,
                    referenceNumber: paymentDto.referenceNumber ?? null,
                    notes: paymentDto.notes ?? null,
                });
                const savedPayment = await queryRunner.manager.save(payment);
                savedPayments.push(savedPayment);
            }

            // Actualizar inventario si no se ha hecho
            if (!sale.inventoryUpdated) {
                await this.updateInventoryFromSale(id, queryRunner.manager);
                sale.inventoryUpdated = true;
            }

            sale.status = SaleStatus.COMPLETED;
            sale.isOnAccount = false;

            // Usar update directo para evitar que el cascade de payments cause problemas
            await queryRunner.manager.update(Sale, sale.id, {
                status: SaleStatus.COMPLETED,
                isOnAccount: false,
                inventoryUpdated: sale.inventoryUpdated,
            });
            await queryRunner.commitTransaction();

            // Registrar ingresos en caja (después del commit)
            for (const payment of savedPayments) {
                try {
                    await this.cashRegisterService.registerIncome(
                        { salePaymentId: payment.id },
                        userId || 'system',
                    );
                    console.log(`[Ventas] Ingreso registrado en caja: ${payment.amount} (${payment.paymentMethodId})`);
                } catch (error_) {
                    console.warn(`[Ventas] No se pudo registrar ingreso en caja: ${(error_ as Error).message}`);
                }
            }

            // Log de auditoría para pago de venta
            if (userId) {
                await this.auditService.logSilent({
                    entityType: AuditEntityType.SALE,
                    entityId: id,
                    action: AuditAction.PAY,
                    userId,
                    previousValues: { status: SaleStatus.PENDING, isOnAccount: true },
                    newValues: {
                        status: SaleStatus.COMPLETED,
                        isOnAccount: false,
                        payments: savedPayments.map(p => ({ amount: p.amount, methodId: p.paymentMethodId })),
                    },
                    description: AuditService.generateDescription(
                        AuditAction.PAY,
                        AuditEntityType.SALE,
                        sale.saleNumber
                    ),
                });
            }

            return this.findOne(id);
        } catch (err) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }
    }

    /**
     * Obtiene ventas del día actual
     */
    async getTodaySales(): Promise<Sale[]> {
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));

        return this.saleRepo
            .createQueryBuilder('sale')
            .leftJoinAndSelect('sale.items', 'items')
            .leftJoinAndSelect('sale.payments', 'payments')
            .leftJoinAndSelect('sale.customer', 'customer')
            .where('sale.saleDate BETWEEN :start AND :end', {
                start: startOfDay,
                end: endOfDay,
            })
            .andWhere('sale.deletedAt IS NULL')
            .orderBy('sale.saleDate', 'DESC')
            .getMany();
    }

    /**
     * Obtiene estadísticas de ventas
     */
    async getStats(startDate?: string, endDate?: string): Promise<SaleStats> {
        const query = this.saleRepo
            .createQueryBuilder('sale')
            .leftJoinAndSelect('sale.payments', 'payments')
            .leftJoinAndSelect('payments.paymentMethod', 'paymentMethod')
            .where('sale.deletedAt IS NULL');

        if (startDate && endDate) {
            query.andWhere('DATE(sale.saleDate) BETWEEN :start AND :end', {
                start: startDate,
                end: endDate,
            });
        }

        const sales = await query.getMany();

        const totalSales = sales.length;

        const totalAmount = sales
            .filter((s) => s.status !== SaleStatus.CANCELLED)
            .reduce((sum, s) => sum + Number(s.total), 0);

        const totalCompleted = sales
            .filter((s) => s.status === SaleStatus.COMPLETED)
            .reduce((sum, s) => sum + Number(s.total), 0);

        const totalPending = sales
            .filter((s) => s.status === SaleStatus.PENDING || s.status === SaleStatus.PARTIAL)
            .reduce((sum, s) => sum + Number(s.total), 0);

        // Contar por estado
        const salesByStatus = {
            [SaleStatus.COMPLETED]: 0,
            [SaleStatus.PENDING]: 0,
            [SaleStatus.PARTIAL]: 0,
            [SaleStatus.CANCELLED]: 0,
        };

        for (const sale of sales) {
            salesByStatus[sale.status]++;
        }

        // Contar por método de pago
        const salesByPaymentMethod: Record<string, number> = {};
        for (const sale of sales) {
            for (const payment of sale.payments || []) {
                const method = payment.paymentMethod?.name ?? 'Desconocido';
                salesByPaymentMethod[method] = (salesByPaymentMethod[method] || 0) + Number(payment.amount);
            }
        }

        return {
            totalSales,
            totalAmount,
            totalCompleted,
            totalPending,
            salesByStatus,
            salesByPaymentMethod,
        };
    }

    /**
     * Actualiza inventario desde una venta (resta stock)
     */
    private async updateInventoryFromSale(
        saleId: string,
        manager: EntityManager
    ): Promise<void> {
        // Usar el manager de la transacción para obtener la venta
        // Esto evita el error 404 que ocurre con this.findOne dentro de una transacción no commiteada
        const sale = await manager.findOne(Sale, {
            where: { id: saleId },
            relations: ['items'],
        });

        if (!sale) {
            throw new NotFoundException(`Venta con ID ${saleId} no encontrada`);
        }

        for (const item of sale.items) {
            // saleDate puede ser Date o string dependiendo del contexto de la transacción
            const saleDateStr = sale.saleDate instanceof Date
                ? sale.saleDate.toISOString()
                : String(sale.saleDate);

            await this.inventoryService.createMovement({
                productId: item.productId,
                type: StockMovementType.OUT,
                source: StockMovementSource.SALE,
                quantity: item.quantity,
                cost: item.unitPrice,
                referenceId: sale.saleNumber,
                notes: `Venta ${sale.saleNumber}`,
                date: saleDateStr,
            });
        }
    }

    /**
     * Revierte inventario de una venta cancelada (suma stock)
     */
    private async revertInventoryFromSale(sale: Sale): Promise<void> {
        for (const item of sale.items) {
            await this.inventoryService.createMovement({
                productId: item.productId,
                type: StockMovementType.IN,
                source: StockMovementSource.RETURN,
                quantity: item.quantity,
                cost: item.unitPrice,
                referenceId: sale.saleNumber,
                notes: `Cancelación venta ${sale.saleNumber}`,
                date: new Date().toISOString(),
            });
        }
    }

    /**
     * Genera número de venta único
     */
    private async generateSaleNumber(): Promise<string> {
        const year = new Date().getFullYear();
        const count = await this.saleRepo.count({
            where: { saleNumber: Like(`VENTA-${year}-%`) },
            withDeleted: true,
        });

        const nextNumber = (count + 1).toString().padStart(5, '0');
        return `VENTA-${year}-${nextNumber}`;
    }
}

