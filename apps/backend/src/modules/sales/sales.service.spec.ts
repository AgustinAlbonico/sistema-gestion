/**
 * Tests unitarios para SalesService
 * Cubre los fixes implementados del informe QA
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { SalesService } from './sales.service';
import { Sale, SaleStatus } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SalePayment } from './entities/sale-payment.entity';
import { SaleTax } from './entities/sale-tax.entity';
import { InventoryService } from '../inventory/inventory.service';
import { ProductsService } from '../products/products.service';
import { InvoiceService } from './services/invoice.service';
import { CashRegisterService } from '../cash-register/cash-register.service';
import { CustomerAccountsService } from '../customer-accounts/customer-accounts.service';
import { AuditService } from '../audit/audit.service';

// Mocks
const mockRepository = () => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    })),
});

const mockCashRegisterService = {
    getOpenRegister: jest.fn(),
    registerIncome: jest.fn(),
};

const mockProductsService = {
    findOne: jest.fn(),
};

const mockInventoryService = {
    createMovement: jest.fn(),
};

const mockInvoiceService = {
    generateInvoice: jest.fn(),
};

const mockCustomerAccountsService = {
    createCharge: jest.fn(),
};

const mockAuditService = {
    logSilent: jest.fn(),
};

const mockDataSource = {
    createQueryRunner: jest.fn(() => ({
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
            query: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            getRepository: jest.fn(() => mockRepository()),
        },
    })),
};

describe('SalesService', () => {
    let service: SalesService;
    let saleRepo: Repository<Sale>;
    let cashRegisterService: typeof mockCashRegisterService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SalesService,
                { provide: getRepositoryToken(Sale), useFactory: mockRepository },
                { provide: getRepositoryToken(SaleItem), useFactory: mockRepository },
                { provide: getRepositoryToken(SalePayment), useFactory: mockRepository },
                { provide: getRepositoryToken(SaleTax), useFactory: mockRepository },
                { provide: CashRegisterService, useValue: mockCashRegisterService },
                { provide: ProductsService, useValue: mockProductsService },
                { provide: InventoryService, useValue: mockInventoryService },
                { provide: InvoiceService, useValue: mockInvoiceService },
                { provide: CustomerAccountsService, useValue: mockCustomerAccountsService },
                { provide: AuditService, useValue: mockAuditService },
                { provide: DataSource, useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<SalesService>(SalesService);
        saleRepo = module.get<Repository<Sale>>(getRepositoryToken(Sale));
        cashRegisterService = module.get(CashRegisterService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('FIX 1.1: canCreateSale - Verificación de caja', () => {
        it('debe retornar canCreate=true cuando hay caja abierta', async () => {
            cashRegisterService.getOpenRegister.mockResolvedValue({ id: 'cash-1', status: 'open' });

            const result = await service.canCreateSale();

            expect(result.canCreate).toBe(true);
            expect(result.reason).toBeUndefined();
        });

        it('debe retornar canCreate=false con razón cuando no hay caja abierta', async () => {
            cashRegisterService.getOpenRegister.mockResolvedValue(null);

            const result = await service.canCreateSale();

            expect(result.canCreate).toBe(false);
            expect(result.reason).toContain('No hay caja abierta');
        });
    });

    describe('FIX 7.8: Validación de impuestos duplicados', () => {
        // Testeamos el método privado directamente para evitar mocks complejos
        const getValidator = () => (service as any).validateNoDuplicateTaxes.bind(service);

        it('debe rechazar impuestos duplicados exactos', () => {
            const validateNoDuplicateTaxes = getValidator();
            const taxes = [
                { name: 'IVA', amount: 21 },
                { name: 'IVA', amount: 10.5 }, // Duplicado
            ];

            expect(() => validateNoDuplicateTaxes(taxes)).toThrow(BadRequestException);
            expect(() => validateNoDuplicateTaxes(taxes)).toThrow(/impuestos duplicados/i);
        });

        it('debe rechazar impuestos duplicados sin importar mayúsculas/minúsculas', () => {
            const validateNoDuplicateTaxes = getValidator();
            const taxes = [
                { name: 'IVA', amount: 21 },
                { name: 'iva', amount: 10.5 }, // Duplicado case-insensitive
            ];

            expect(() => validateNoDuplicateTaxes(taxes)).toThrow(BadRequestException);
        });

        it('debe rechazar impuestos duplicados con espacios', () => {
            const validateNoDuplicateTaxes = getValidator();
            const taxes = [
                { name: 'IVA', amount: 21 },
                { name: ' IVA ', amount: 10.5 }, // Duplicado con espacios
            ];

            expect(() => validateNoDuplicateTaxes(taxes)).toThrow(BadRequestException);
        });

        it('debe permitir venta con impuestos diferentes', () => {
            const validateNoDuplicateTaxes = getValidator();
            const taxes = [
                { name: 'IVA', amount: 21 },
                { name: 'IIBB', amount: 5 },
            ];

            // No debe lanzar excepción
            expect(() => validateNoDuplicateTaxes(taxes)).not.toThrow();
        });

        it('debe permitir venta sin impuestos', () => {
            const validateNoDuplicateTaxes = getValidator();

            expect(() => validateNoDuplicateTaxes(undefined)).not.toThrow();
            expect(() => validateNoDuplicateTaxes([])).not.toThrow();
        });
    });

    describe('FIX 1.2: generateSaleNumberTransactional - Race condition', () => {
        it('debe generar número con formato correcto', async () => {
            // Acceder al método privado
            const generateSaleNumberTransactional = (service as any).generateSaleNumberTransactional.bind(service);

            const mockManager = {
                query: jest.fn().mockResolvedValue([]),
            };

            const result = await generateSaleNumberTransactional(mockManager);

            const year = new Date().getFullYear();
            expect(result).toMatch(new RegExp(`^VENTA-${year}-\\d{5}$`));
        });

        it('debe generar número 00001 cuando no hay ventas previas', async () => {
            const generateSaleNumberTransactional = (service as any).generateSaleNumberTransactional.bind(service);

            const mockManager = {
                query: jest.fn().mockResolvedValue([]), // Sin ventas previas
            };

            const result = await generateSaleNumberTransactional(mockManager);

            const year = new Date().getFullYear();
            expect(result).toBe(`VENTA-${year}-00001`);
        });

        it('debe incrementar número basado en última venta', async () => {
            const generateSaleNumberTransactional = (service as any).generateSaleNumberTransactional.bind(service);
            const year = new Date().getFullYear();

            const mockManager = {
                query: jest.fn().mockResolvedValue([
                    { saleNumber: `VENTA-${year}-00042` }
                ]),
            };

            const result = await generateSaleNumberTransactional(mockManager);

            expect(result).toBe(`VENTA-${year}-00043`);
        });

        it('debe usar FOR UPDATE en la query para bloquear filas', async () => {
            const generateSaleNumberTransactional = (service as any).generateSaleNumberTransactional.bind(service);

            const mockManager = {
                query: jest.fn().mockResolvedValue([]),
            };

            await generateSaleNumberTransactional(mockManager);

            // Verificar que la query incluya FOR UPDATE
            const queryCall = mockManager.query.mock.calls[0][0];
            expect(queryCall).toContain('FOR UPDATE');
        });

        it('debe ordenar por saleNumber DESC para obtener el último', async () => {
            const generateSaleNumberTransactional = (service as any).generateSaleNumberTransactional.bind(service);

            const mockManager = {
                query: jest.fn().mockResolvedValue([]),
            };

            await generateSaleNumberTransactional(mockManager);

            const queryCall = mockManager.query.mock.calls[0][0];
            expect(queryCall).toContain('ORDER BY');
            expect(queryCall).toContain('saleNumber');
            expect(queryCall).toContain('DESC');
        });

        it('debe manejar números con muchos dígitos', async () => {
            const generateSaleNumberTransactional = (service as any).generateSaleNumberTransactional.bind(service);
            const year = new Date().getFullYear();

            const mockManager = {
                query: jest.fn().mockResolvedValue([
                    { saleNumber: `VENTA-${year}-99999` }
                ]),
            };

            const result = await generateSaleNumberTransactional(mockManager);

            expect(result).toBe(`VENTA-${year}-100000`);
        });
    });
});
