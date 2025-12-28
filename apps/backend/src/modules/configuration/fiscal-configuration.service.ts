/**
 * Servicio de configuración fiscal (AFIP)
 * Gestiona datos del emisor, certificados y conexión con AFIP
 */
import { Injectable, OnModuleInit, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FiscalConfiguration, AfipEnvironment } from './entities/fiscal-configuration.entity';
import { IvaCondition } from '../../common/enums/iva-condition.enum';
import {
    UpdateEmitterDataDto,
    UploadCertificatesDto,
    FiscalConfigurationResponseDto,
    AfipConnectionStatusDto,
} from './dto/fiscal-configuration.dto';
import { CertificateEncryptionService } from './certificate-encryption.service';

@Injectable()
export class FiscalConfigurationService implements OnModuleInit {
    private readonly logger = new Logger(FiscalConfigurationService.name);

    constructor(
        @InjectRepository(FiscalConfiguration)
        private readonly fiscalConfigRepo: Repository<FiscalConfiguration>,
        private readonly encryptionService: CertificateEncryptionService,
    ) { }

    /**
     * Inicializa la configuración fiscal por defecto si no existe
     */
    async onModuleInit() {
        const count = await this.fiscalConfigRepo.count();
        if (count === 0) {
            this.logger.log('Creando configuración fiscal por defecto...');
            await this.fiscalConfigRepo.save({
                ivaCondition: IvaCondition.RESPONSABLE_MONOTRIBUTO,
                pointOfSale: 1,
                afipEnvironment: AfipEnvironment.HOMOLOGACION,
                isConfigured: false,
                homologacionReady: false,
                produccionReady: false,
            });
        }
    }

    /**
     * Obtiene la configuración fiscal actual
     */
    async getConfiguration(): Promise<FiscalConfiguration> {
        const configs = await this.fiscalConfigRepo.find();
        if (configs.length === 0) {
            throw new Error('Configuración fiscal no inicializada');
        }
        return configs[0];
    }

    /**
     * Obtiene la configuración fiscal sin datos sensibles
     */
    async getPublicConfiguration(): Promise<FiscalConfigurationResponseDto> {
        const config = await this.getConfiguration();

        return {
            id: config.id,
            businessName: config.businessName,
            cuit: config.cuit,
            grossIncome: config.grossIncome,
            activityStartDate: config.activityStartDate,
            businessAddress: config.businessAddress,
            ivaCondition: config.ivaCondition,
            pointOfSale: config.pointOfSale,
            afipEnvironment: config.afipEnvironment,
            isConfigured: config.isConfigured,
            homologacionReady: config.homologacionReady,
            homologacionUploadedAt: config.homologacionUploadedAt,
            homologacionExpiresAt: config.homologacionExpiresAt,
            homologacionFingerprint: config.homologacionFingerprint,
            produccionReady: config.produccionReady,
            produccionUploadedAt: config.produccionUploadedAt,
            produccionExpiresAt: config.produccionExpiresAt,
            produccionFingerprint: config.produccionFingerprint,
            createdAt: config.createdAt,
            updatedAt: config.updatedAt,
        };
    }

    /**
     * Actualiza los datos del emisor
     */
    async updateEmitterData(dto: UpdateEmitterDataDto): Promise<FiscalConfigurationResponseDto> {
        const config = await this.getConfiguration();

        // Validar CUIT si se proporciona
        if (dto.cuit !== undefined && dto.cuit) {
            const cuitValidation = this.validateCuit(dto.cuit);
            if (!cuitValidation.valid) {
                throw new BadRequestException(`CUIT inválido: ${cuitValidation.error}`);
            }
        }

        // Actualizar campos
        if (dto.businessName !== undefined) config.businessName = dto.businessName;
        if (dto.cuit !== undefined) config.cuit = dto.cuit;
        if (dto.grossIncome !== undefined) config.grossIncome = dto.grossIncome;
        if (dto.activityStartDate !== undefined) {
            // Parsear la fecha manualmente para evitar problemas de zona horaria
            // Cuando se recibe "2025-12-14", new Date() lo interpreta como UTC 00:00
            // lo cual puede resultar en el día anterior en zonas horarias negativas (ej: Argentina UTC-3)
            const [year, month, day] = dto.activityStartDate.split('-').map(Number);
            config.activityStartDate = new Date(year, month - 1, day); // Mes es 0-indexed
        }
        if (dto.businessAddress !== undefined) config.businessAddress = dto.businessAddress;
        if (dto.ivaCondition !== undefined) config.ivaCondition = dto.ivaCondition;
        if (dto.pointOfSale !== undefined) config.pointOfSale = dto.pointOfSale;

        // Verificar si está configurado (campos mínimos)
        config.isConfigured = this.checkIsConfigured(config);

        await this.fiscalConfigRepo.save(config);
        this.logger.log('Datos del emisor actualizados');

        return this.getPublicConfiguration();
    }

    /**
     * Valida un CUIT argentino usando el algoritmo módulo 11
     * El CUIT tiene el formato XX-XXXXXXXX-X donde el último dígito es verificador
     */
    private validateCuit(cuit: string): { valid: boolean; error?: string } {
        // Limpiar: solo dígitos
        const cleanCuit = cuit.replace(/\D/g, '');

        // Debe tener exactamente 11 dígitos
        if (cleanCuit.length !== 11) {
            return { valid: false, error: 'Debe tener exactamente 11 dígitos' };
        }

        // Algoritmo módulo 11 para validar el dígito verificador
        const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
        let sum = 0;

        for (let i = 0; i < 10; i++) {
            sum += parseInt(cleanCuit[i], 10) * multipliers[i];
        }

        const remainder = sum % 11;
        const expectedVerifier = remainder === 0 ? 0 : remainder === 1 ? 9 : 11 - remainder;
        const actualVerifier = parseInt(cleanCuit[10], 10);

        if (expectedVerifier !== actualVerifier) {
            return { valid: false, error: 'Dígito verificador incorrecto' };
        }

        // Validar tipo de CUIT (primeros 2 dígitos)
        const tiposCuitValidos = ['20', '23', '24', '27', '30', '33', '34'];
        const tipoCuit = cleanCuit.substring(0, 2);
        if (!tiposCuitValidos.includes(tipoCuit)) {
            return { valid: false, error: `Tipo de CUIT ${tipoCuit} no válido` };
        }

        return { valid: true };
    }

    /**
     * Cambia el entorno activo de AFIP
     */
    async setEnvironment(environment: AfipEnvironment): Promise<FiscalConfigurationResponseDto> {
        const config = await this.getConfiguration();
        config.afipEnvironment = environment;
        await this.fiscalConfigRepo.save(config);

        this.logger.log(`Entorno AFIP cambiado a: ${environment}`);
        return this.getPublicConfiguration();
    }

    /**
     * Sube certificados para un entorno
     * NOTA: Los certificados se almacenan SIN CIFRADO por simplicidad
     */
    async uploadCertificates(dto: UploadCertificatesDto): Promise<FiscalConfigurationResponseDto> {
        const config = await this.getConfiguration();

        // Decodificar y validar certificados
        let certContent: string;
        let keyContent: string;

        try {
            certContent = Buffer.from(dto.certificate, 'base64').toString('utf-8');
            keyContent = Buffer.from(dto.privateKey, 'base64').toString('utf-8');
        } catch {
            throw new BadRequestException('Los certificados deben estar en formato Base64 válido');
        }

        // Validar que parecen ser certificados PEM
        if (!certContent.includes('-----BEGIN CERTIFICATE-----')) {
            throw new BadRequestException('El certificado no parece ser un archivo .crt válido');
        }
        if (!keyContent.includes('-----BEGIN') || !keyContent.includes('KEY-----')) {
            throw new BadRequestException('La clave privada no parece ser un archivo .key válido');
        }

        // Generar fingerprint para identificación
        const fingerprint = this.encryptionService.generateFingerprint(certContent);

        // Guardar según el entorno (SIN CIFRADO)
        if (dto.environment === AfipEnvironment.HOMOLOGACION) {
            config.homologacionCertificate = certContent;
            config.homologacionPrivateKey = keyContent;
            config.homologacionUploadedAt = new Date();
            config.homologacionExpiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
            config.homologacionFingerprint = fingerprint;
            config.homologacionReady = true;
        } else {
            config.produccionCertificate = certContent;
            config.produccionPrivateKey = keyContent;
            config.produccionUploadedAt = new Date();
            config.produccionExpiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
            config.produccionFingerprint = fingerprint;
            config.produccionReady = true;
        }

        await this.fiscalConfigRepo.save(config);
        this.logger.log(`Certificados de ${dto.environment} subidos correctamente`);

        return this.getPublicConfiguration();
    }

    /**
     * Elimina los certificados de un entorno
     */
    async deleteCertificates(environment: AfipEnvironment): Promise<FiscalConfigurationResponseDto> {
        const config = await this.getConfiguration();

        if (environment === AfipEnvironment.HOMOLOGACION) {
            config.homologacionCertificate = null;
            config.homologacionPrivateKey = null;
            config.homologacionUploadedAt = null;
            config.homologacionExpiresAt = null;
            config.homologacionFingerprint = null;
            config.homologacionReady = false;
        } else {
            config.produccionCertificate = null;
            config.produccionPrivateKey = null;
            config.produccionUploadedAt = null;
            config.produccionExpiresAt = null;
            config.produccionFingerprint = null;
            config.produccionReady = false;
        }

        await this.fiscalConfigRepo.save(config);
        this.logger.log(`Certificados de ${environment} eliminados`);

        return this.getPublicConfiguration();
    }

    /**
     * Obtiene los certificados del entorno activo
     * Solo para uso interno del AfipService
     * NOTA: Los certificados se almacenan sin cifrado
     * MEJORA: Valida vencimiento del certificado antes de retornarlo
     */
    async getDecryptedCertificates(): Promise<{
        certificate: string;
        privateKey: string;
    } | null> {
        const config = await this.getConfiguration();
        const isHomologacion = config.afipEnvironment === AfipEnvironment.HOMOLOGACION;
        const environmentName = isHomologacion ? 'homologación' : 'producción';

        const cert = isHomologacion
            ? config.homologacionCertificate
            : config.produccionCertificate;
        const key = isHomologacion
            ? config.homologacionPrivateKey
            : config.produccionPrivateKey;
        const expiresAt = isHomologacion
            ? config.homologacionExpiresAt
            : config.produccionExpiresAt;

        if (!cert || !key) {
            return null;
        }

        // Validar vencimiento del certificado
        if (expiresAt) {
            const now = new Date();
            const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            if (daysUntilExpiry <= 0) {
                this.logger.error(`¡CERTIFICADO VENCIDO! El certificado de ${environmentName} venció el ${expiresAt.toLocaleDateString()}.`);
                throw new Error(
                    `El certificado de ${environmentName} ha vencido el ${expiresAt.toLocaleDateString()}. ` +
                    'Por favor, genere un nuevo certificado en AFIP y súbalo al sistema.'
                );
            }

            if (daysUntilExpiry <= 7) {
                this.logger.error(`¡URGENTE! El certificado de ${environmentName} vence en ${daysUntilExpiry} días (${expiresAt.toLocaleDateString()}).`);
            } else if (daysUntilExpiry <= 15) {
                this.logger.warn(`¡ALERTA! El certificado de ${environmentName} vence en ${daysUntilExpiry} días (${expiresAt.toLocaleDateString()}).`);
            } else if (daysUntilExpiry <= 30) {
                this.logger.log(`Recordatorio: El certificado de ${environmentName} vence en ${daysUntilExpiry} días.`);
            }
        }

        return {
            certificate: cert,
            privateKey: key,
        };
    }

    /**
     * Obtiene el estado de vencimiento de los certificados
     * Útil para mostrar alertas en la UI
     */
    async getCertificateExpirationStatus(): Promise<{
        homologacion: { expiresAt: Date | null; daysLeft: number | null; status: 'ok' | 'warning' | 'critical' | 'expired' | 'unknown' };
        produccion: { expiresAt: Date | null; daysLeft: number | null; status: 'ok' | 'warning' | 'critical' | 'expired' | 'unknown' };
    }> {
        const config = await this.getConfiguration();
        const now = new Date();

        const getStatus = (expiresAt: Date | null): { expiresAt: Date | null; daysLeft: number | null; status: 'ok' | 'warning' | 'critical' | 'expired' | 'unknown' } => {
            if (!expiresAt) {
                return { expiresAt: null, daysLeft: null, status: 'unknown' };
            }

            const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            if (daysLeft <= 0) {
                return { expiresAt, daysLeft, status: 'expired' };
            } else if (daysLeft <= 7) {
                return { expiresAt, daysLeft, status: 'critical' };
            } else if (daysLeft <= 30) {
                return { expiresAt, daysLeft, status: 'warning' };
            }
            return { expiresAt, daysLeft, status: 'ok' };
        };

        return {
            homologacion: getStatus(config.homologacionExpiresAt),
            produccion: getStatus(config.produccionExpiresAt),
        };
    }

    /**
     * Verifica si la configuración está lista para facturar
     */
    async isReadyForInvoicing(): Promise<{
        ready: boolean;
        missingFields: string[];
    }> {
        const config = await this.getConfiguration();
        const missingFields: string[] = [];

        if (!config.businessName) missingFields.push('businessName');
        if (!config.cuit) missingFields.push('cuit');
        if (!config.businessAddress) missingFields.push('businessAddress');

        const isHomologacion = config.afipEnvironment === AfipEnvironment.HOMOLOGACION;
        const certificatesReady = isHomologacion
            ? config.homologacionReady
            : config.produccionReady;

        if (!certificatesReady) {
            missingFields.push(`certificados_${config.afipEnvironment}`);
        }

        return {
            ready: missingFields.length === 0,
            missingFields,
        };
    }

    /**
     * Verifica si los campos mínimos están configurados
     */
    private checkIsConfigured(config: FiscalConfiguration): boolean {
        return !!(config.businessName && config.cuit && config.businessAddress);
    }

    /**
     * Prueba la conexión con AFIP
     * Verifica la configuración y simula un test de conexión
     */
    async testAfipConnection(): Promise<AfipConnectionStatusDto> {
        const config = await this.getConfiguration();
        const { missingFields } = await this.isReadyForInvoicing();

        const isHomologacion = config.afipEnvironment === AfipEnvironment.HOMOLOGACION;
        const certificatesReady = isHomologacion
            ? config.homologacionReady
            : config.produccionReady;

        let connectionResult: { success: boolean; message: string } = {
            success: false,
            message: 'No se pudo determinar el estado de conexión.',
        };

        if (!config.isConfigured) {
            connectionResult = {
                success: false,
                message: `Configuración incompleta. Faltan: ${missingFields.join(', ')}`,
            };
        } else if (!certificatesReady) {
            connectionResult = {
                success: false,
                message: 'Certificados no configurados para el entorno seleccionado.',
            };
        } else if (certificatesReady) {
            // Simular test de conexión exitoso
            // En producción, aquí se haría la autenticación real con WSAA
            connectionResult = {
                success: true,
                message: 'Configuración válida. Modo simulación activo (sin conexión real a AFIP).',
            };
            this.logger.log('Test de conexión AFIP: simulación exitosa');
        }

        return {
            configured: config.isConfigured,
            environment: config.afipEnvironment,
            certificatesReady,
            connection: {
                success: connectionResult.success,
                message: connectionResult.message,
                testedAt: new Date(),
            },
        };
    }

    // === GESTIÓN DE TOKEN WSAA ===

    /**
     * Obtiene el token WSAA almacenado en la base de datos
     * Retorna null si no hay token o si está expirado
     * Usa el token del ambiente activo (homologación o producción)
     */
    async getStoredWsaaToken(): Promise<{
        token: string;
        sign: string;
        expirationTime: Date;
    } | null> {
        const config = await this.getConfiguration();
        const isHomologacion = config.afipEnvironment === AfipEnvironment.HOMOLOGACION;

        // Obtener token según el ambiente activo
        const token = isHomologacion ? config.wsaaTokenHomologacion : config.wsaaTokenProduccion;
        const sign = isHomologacion ? config.wsaaSignHomologacion : config.wsaaSignProduccion;
        const expiration = isHomologacion
            ? config.wsaaTokenExpirationHomologacion
            : config.wsaaTokenExpirationProduccion;

        if (!token || !sign || !expiration) {
            return null;
        }

        const expirationDate = new Date(expiration);

        // Retornar null si el token ya expiró
        if (expirationDate <= new Date()) {
            this.logger.debug(`Token WSAA de ${config.afipEnvironment} está expirado`);
            return null;
        }

        return {
            token: token,
            sign: sign,
            expirationTime: expirationDate,
        };
    }

    /**
     * Guarda el token WSAA en la base de datos
     * Se persiste para no perderlo si se reinicia el servidor
     * Guarda en el campo del ambiente activo (homologación o producción)
     */
    async saveWsaaToken(token: string, sign: string, expirationTime: Date): Promise<void> {
        const config = await this.getConfiguration();
        const isHomologacion = config.afipEnvironment === AfipEnvironment.HOMOLOGACION;

        if (isHomologacion) {
            config.wsaaTokenHomologacion = token;
            config.wsaaSignHomologacion = sign;
            config.wsaaTokenExpirationHomologacion = expirationTime;
        } else {
            config.wsaaTokenProduccion = token;
            config.wsaaSignProduccion = sign;
            config.wsaaTokenExpirationProduccion = expirationTime;
        }

        await this.fiscalConfigRepo.save(config);
        this.logger.log(`Token WSAA de ${config.afipEnvironment} guardado. Expira: ${expirationTime.toISOString()}`);
    }

    /**
     * Limpia el token WSAA de la base de datos
     * Útil cuando hay problemas de sincronización con AFIP
     * Solo limpia el token del ambiente activo
     */
    async clearWsaaToken(): Promise<void> {
        const config = await this.getConfiguration();
        const isHomologacion = config.afipEnvironment === AfipEnvironment.HOMOLOGACION;

        if (isHomologacion) {
            config.wsaaTokenHomologacion = null;
            config.wsaaSignHomologacion = null;
            config.wsaaTokenExpirationHomologacion = null;
        } else {
            config.wsaaTokenProduccion = null;
            config.wsaaSignProduccion = null;
            config.wsaaTokenExpirationProduccion = null;
        }

        await this.fiscalConfigRepo.save(config);
        this.logger.log(`Token WSAA de ${config.afipEnvironment} eliminado de la base de datos`);
    }
}

