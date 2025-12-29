/**
 * Tests unitarios para ProductsService
 * Cobertura del fix 7.7: Producto con precio $0
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { ProductsRepository } from './products.repository';
import { CategoriesRepository } from './categories.repository';
import { ConfigurationService } from '../configuration/configuration.service';
import { InventoryService } from '../inventory/inventory.service';

// Mocks
const mockProductsRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findWithFilters: jest.fn(),
};

const mockCategoriesRepository = {
    findOne: jest.fn(),
};

const mockConfigurationService = {
    getDefaultProfitMargin: jest.fn().mockResolvedValue(30),
    getMinStockAlert: jest.fn().mockResolvedValue(5),
};

const mockInventoryService = {
    createMovement: jest.fn(),
};

describe('ProductsService', () => {
    let service: ProductsService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProductsService,
                { provide: ProductsRepository, useValue: mockProductsRepository },
                { provide: CategoriesRepository, useValue: mockCategoriesRepository },
                { provide: ConfigurationService, useValue: mockConfigurationService },
                { provide: InventoryService, useValue: mockInventoryService },
            ],
        }).compile();

        service = module.get<ProductsService>(ProductsService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('FIX 7.7: calculatePrice - Productos con costo $0', () => {
        // Accedemos al método privado para testear
        // En producción, esto se testearía indirectamente a través de create/update

        it('debe retornar 0 cuando el costo es 0', () => {
            // Usamos reflection para acceder al método privado
            const calculatePrice = (service as any).calculatePrice.bind(service);

            const result = calculatePrice(0, 30);

            expect(result).toBe(0);
        });

        it('debe retornar 0 cuando el costo es negativo', () => {
            const calculatePrice = (service as any).calculatePrice.bind(service);

            const result = calculatePrice(-10, 30);

            expect(result).toBe(0);
        });

        it('debe calcular precio correctamente para costos positivos', () => {
            const calculatePrice = (service as any).calculatePrice.bind(service);

            // Costo $100 con 30% margen = $130
            const result = calculatePrice(100, 30);

            expect(result).toBe(130);
        });

        it('debe redondear a 2 decimales', () => {
            const calculatePrice = (service as any).calculatePrice.bind(service);

            // Costo $100 con 33.33% margen = $133.33
            const result = calculatePrice(100, 33.33);

            expect(result).toBe(133.33);
        });

        it('debe manejar margen 0%', () => {
            const calculatePrice = (service as any).calculatePrice.bind(service);

            const result = calculatePrice(100, 0);

            expect(result).toBe(100);
        });
    });
});
