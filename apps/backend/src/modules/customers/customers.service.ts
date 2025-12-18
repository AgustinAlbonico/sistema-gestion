/**
 * Servicio de clientes
 * Implementa la lógica de negocio para gestión de clientes
 */
import {
    Injectable,
    NotFoundException,
    ConflictException,
    BadRequestException,
} from '@nestjs/common';
import { CustomersRepository } from './customers.repository';
import { CustomerCategoriesRepository } from './customer-categories.repository';
import { FiscalConfigurationService } from '../configuration/fiscal-configuration.service';
import {
    CreateCustomerDto,
    UpdateCustomerDto,
    QueryCustomersDto,
} from './dto';
import { Customer, DocumentType } from './entities/customer.entity';
import { IvaCondition } from '../../common/enums/iva-condition.enum';

@Injectable()
export class CustomersService {
    constructor(
        private readonly customersRepository: CustomersRepository,
        private readonly categoriesRepository: CustomerCategoriesRepository,
        private readonly fiscalConfigService: FiscalConfigurationService,
    ) { }

    /**
     * Crea un nuevo cliente
     * Valida unicidad de documento y email
     */
    async create(dto: CreateCustomerDto) {
        // Validar documento único si se proporciona
        if (dto.documentNumber) {
            const existingCustomer = await this.customersRepository.findByDocumentNumber(
                dto.documentNumber,
            );
            if (existingCustomer) {
                throw new ConflictException('El número de documento ya está registrado');
            }
        }

        // Validar email único si se proporciona
        if (dto.email && dto.email.trim() !== '') {
            const existingEmail = await this.customersRepository.findByEmail(dto.email);
            if (existingEmail) {
                throw new ConflictException('El email ya está registrado');
            }
        }

        // Validar que la categoría existe si se proporciona
        if (dto.categoryId && dto.categoryId.trim() !== '') {
            const category = await this.categoriesRepository.findOne({
                where: { id: dto.categoryId },
            });
            if (!category) {
                throw new NotFoundException('Categoría no encontrada');
            }
        }

        // Validar CUIT obligatorio para cliente RI si emisor es RI
        await this.validateCuitForResponsableInscripto(
            dto.ivaCondition,
            dto.documentType,
            dto.documentNumber
        );

        // Limpiar campos vacíos y convertir undefined a null
        const cleanedDto = {
            ...dto,
            documentType: (dto.documentType as DocumentType) || null,
            ivaCondition: (dto.ivaCondition as IvaCondition) || null,
            documentNumber: dto.documentNumber?.trim() || null,
            email: dto.email?.trim() || null,
            phone: dto.phone?.trim() || null,
            mobile: dto.mobile?.trim() || null,
            address: dto.address?.trim() || null,
            city: dto.city?.trim() || null,
            state: dto.state?.trim() || null,
            postalCode: dto.postalCode?.trim() || null,
            categoryId: dto.categoryId?.trim() || null,
            notes: dto.notes?.trim() || null,
        };

        const customer = this.customersRepository.create(cleanedDto);
        return this.customersRepository.save(customer);
    }

    /**
     * Lista clientes con filtros y paginación
     */
    async findAll(filters: QueryCustomersDto) {
        const [data, total] = await this.customersRepository.findWithFilters(filters);

        return {
            data,
            total,
            page: filters.page,
            limit: filters.limit,
            totalPages: Math.ceil(total / filters.limit),
        };
    }

    /**
     * Obtiene un cliente por ID
     */
    async findOne(id: string) {
        const customer = await this.customersRepository.findOne({
            where: { id },
            relations: ['category'],
        });

        if (!customer) {
            throw new NotFoundException('Cliente no encontrado');
        }

        return customer;
    }

    /**
     * Actualiza un cliente existente
     */
    async update(id: string, dto: UpdateCustomerDto) {
        const customer = await this.findOne(id);

        await this.validateCustomerUpdate(customer, dto);

        Object.assign(customer, this.buildCustomerUpdatePayload(dto));
        return this.customersRepository.save(customer);
    }

    private async validateCustomerUpdate(customer: Customer, dto: UpdateCustomerDto): Promise<void> {
        if (dto.documentNumber && dto.documentNumber !== customer.documentNumber) {
            const existingCustomer = await this.customersRepository.findByDocumentNumber(dto.documentNumber);
            if (existingCustomer) {
                throw new ConflictException('El número de documento ya está registrado');
            }
        }

        if (dto.email && dto.email.trim() !== '' && dto.email !== customer.email) {
            const existingEmail = await this.customersRepository.findByEmail(dto.email);
            if (existingEmail) {
                throw new ConflictException('El email ya está registrado');
            }
        }

        if (dto.categoryId && dto.categoryId.trim() !== '') {
            const category = await this.categoriesRepository.findOne({
                where: { id: dto.categoryId },
            });
            if (!category) {
                throw new NotFoundException('Categoría no encontrada');
            }
        }

        // Validar CUIT si cambia la condición IVA a RI
        const finalIvaCondition = dto.ivaCondition ?? customer.ivaCondition;
        const finalDocType = dto.documentType ?? customer.documentType;
        const finalDocNumber = dto.documentNumber ?? customer.documentNumber;

        await this.validateCuitForResponsableInscripto(
            finalIvaCondition,
            finalDocType,
            finalDocNumber
        );
    }

    /**
     * Valida que si el emisor es Responsable Inscripto y el cliente también,
     * entonces el cliente debe tener CUIT obligatorio (requerido por AFIP para Factura A)
     */
    private async validateCuitForResponsableInscripto(
        customerIvaCondition?: IvaCondition | null,
        documentType?: DocumentType | null | string,
        documentNumber?: string | null
    ): Promise<void> {
        // Si el cliente no es Responsable Inscripto, no aplica la validación
        if (customerIvaCondition !== IvaCondition.RESPONSABLE_INSCRIPTO) {
            return;
        }

        // Obtener configuración fiscal del emisor
        try {
            const fiscalConfig = await this.fiscalConfigService.getPublicConfiguration();

            // Si el emisor no es Responsable Inscripto, no aplica la validación
            if (fiscalConfig.ivaCondition !== IvaCondition.RESPONSABLE_INSCRIPTO) {
                return;
            }

            // Emisor RI + Cliente RI = CUIT obligatorio
            const isDocTypeCuit = documentType === 'CUIT' || documentType === DocumentType.CUIT;
            const hasValidCuit = isDocTypeCuit && documentNumber && documentNumber.trim().length === 11;

            if (!hasValidCuit) {
                throw new BadRequestException(
                    'Para clientes Responsable Inscripto, el CUIT es obligatorio (11 dígitos). ' +
                    'Este dato es requerido por AFIP para emitir Factura A.'
                );
            }
        } catch (error) {
            // Si es BadRequestException, relanzar
            if (error instanceof BadRequestException) {
                throw error;
            }
            // Si no hay configuración fiscal, no aplicar validación estricta
            return;
        }
    }

    private buildCustomerUpdatePayload(dto: UpdateCustomerDto): Partial<Customer> {
        const cleanedDto: Partial<Customer> = {};

        if (dto.firstName !== undefined) cleanedDto.firstName = dto.firstName;
        if (dto.lastName !== undefined) cleanedDto.lastName = dto.lastName;
        if (dto.documentType !== undefined) cleanedDto.documentType = (dto.documentType as DocumentType) || null;
        if (dto.ivaCondition !== undefined) cleanedDto.ivaCondition = (dto.ivaCondition as IvaCondition) || null;
        if (dto.documentNumber !== undefined) cleanedDto.documentNumber = dto.documentNumber?.trim() || null;
        if (dto.email !== undefined) cleanedDto.email = dto.email?.trim() || null;
        if (dto.phone !== undefined) cleanedDto.phone = dto.phone?.trim() || null;
        if (dto.mobile !== undefined) cleanedDto.mobile = dto.mobile?.trim() || null;
        if (dto.address !== undefined) cleanedDto.address = dto.address?.trim() || null;
        if (dto.city !== undefined) cleanedDto.city = dto.city?.trim() || null;
        if (dto.state !== undefined) cleanedDto.state = dto.state?.trim() || null;
        if (dto.postalCode !== undefined) cleanedDto.postalCode = dto.postalCode?.trim() || null;
        if (dto.categoryId !== undefined) cleanedDto.categoryId = dto.categoryId?.trim() || null;
        if (dto.notes !== undefined) cleanedDto.notes = dto.notes?.trim() || null;
        if (dto.isActive !== undefined) cleanedDto.isActive = dto.isActive;

        return cleanedDto;
    }

    /**
     * Desactiva un cliente (soft delete)
     */
    async remove(id: string) {
        const customer = await this.findOne(id);

        // Soft delete - solo marcar como inactivo
        customer.isActive = false;
        await this.customersRepository.save(customer);

        return { message: 'Cliente desactivado exitosamente' };
    }

    /**
     * Lista clientes activos (para selectores)
     */
    async getActiveCustomers() {
        return this.customersRepository.findActiveCustomers();
    }

    /**
     * Obtiene estadísticas de clientes
     */
    async getStats() {
        return this.customersRepository.getCustomerStats();
    }
}

