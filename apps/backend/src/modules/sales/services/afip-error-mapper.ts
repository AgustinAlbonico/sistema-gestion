/**
 * Mapeo de errores de AFIP a mensajes amigables para el usuario
 * FIX 4.1: Mensajes de error técnicos AFIP
 */

export interface AfipErrorInfo {
    /** Mensaje amigable para mostrar al usuario */
    message: string;
    /** Acción sugerida */
    action: string;
    /** Nivel de severidad */
    severity: 'error' | 'warning' | 'info';
}

/**
 * Patrones de error y sus mensajes correspondientes
 */
const ERROR_PATTERNS: Array<{ pattern: RegExp | string; info: AfipErrorInfo }> = [
    // Errores de autenticación
    {
        pattern: /UNAUTHORIZED|Token.*invalid|token.*invalido/i,
        info: {
            message: 'Error de autenticación con AFIP',
            action: 'Verifique la configuración del certificado o intente nuevamente en unos minutos.',
            severity: 'error',
        },
    },
    {
        pattern: /certificate.*expired|certificado.*vencido|expirado/i,
        info: {
            message: 'El certificado de AFIP ha expirado',
            action: 'Debe renovar el certificado de AFIP desde la configuración fiscal.',
            severity: 'error',
        },
    },
    {
        pattern: /cms\.sign|OPENSSL|openssl/i,
        info: {
            message: 'Error de firma digital',
            action: 'El certificado de AFIP puede estar corrupto. Genere uno nuevo desde AFIP.',
            severity: 'error',
        },
    },
    // Errores de CUIT/datos fiscales
    {
        pattern: /CUIT.*invalid|CUIT.*inválido|DocNro/i,
        info: {
            message: 'El CUIT del cliente es inválido',
            action: 'Verifique que el CUIT del cliente esté correctamente registrado.',
            severity: 'error',
        },
    },
    {
        pattern: /condicion.*IVA|IvaId/i,
        info: {
            message: 'La condición de IVA del cliente no es válida',
            action: 'Verifique la categoría de IVA del cliente en sus datos fiscales.',
            severity: 'error',
        },
    },
    // Errores de comprobante
    {
        pattern: /comprobante.*duplicado|CAE.*duplicado|already.*exists/i,
        info: {
            message: 'Este comprobante ya fue emitido',
            action: 'La factura ya existe en AFIP. Verifique en el listado de facturas.',
            severity: 'warning',
        },
    },
    {
        pattern: /punto.*venta.*no.*autorizado|PtoVta/i,
        info: {
            message: 'El punto de venta no está autorizado',
            action: 'Configure el punto de venta en AFIP antes de facturar.',
            severity: 'error',
        },
    },
    // Errores de conexión
    {
        pattern: /timeout|ETIMEDOUT|ECONNREFUSED|network/i,
        info: {
            message: 'No se pudo conectar con AFIP',
            action: 'AFIP puede estar en mantenimiento. Intente nuevamente en unos minutos.',
            severity: 'warning',
        },
    },
    {
        pattern: /service.*unavailable|503|500/i,
        info: {
            message: 'El servicio de AFIP no está disponible',
            action: 'AFIP puede estar en mantenimiento. Intente nuevamente más tarde.',
            severity: 'warning',
        },
    },
    // Token fantasma
    {
        pattern: /token.*fantasma|phantom.*token|ta.*ya.*otorgado/i,
        info: {
            message: 'Error de token de AFIP',
            action: 'Debe esperar unos minutos antes de solicitar un nuevo token.',
            severity: 'warning',
        },
    },
    // Errores de importe
    {
        pattern: /importe.*invalido|monto.*incorrecto|ImpTotal/i,
        info: {
            message: 'Los importes de la factura son inválidos',
            action: 'Verifique que los montos sean correctos y no contengan errores.',
            severity: 'error',
        },
    },
];

/**
 * Mapea un error técnico de AFIP a un mensaje amigable
 * @param error - Mensaje de error técnico
 * @returns Información del error con mensaje amigable
 */
export function mapAfipError(error: string | Error): AfipErrorInfo {
    const errorMessage = error instanceof Error ? error.message : error;

    for (const { pattern, info } of ERROR_PATTERNS) {
        if (typeof pattern === 'string') {
            if (errorMessage.includes(pattern)) {
                return info;
            }
        } else if (pattern.test(errorMessage)) {
            return info;
        }
    }

    // Error genérico si no coincide con ningún patrón
    return {
        message: 'Error al procesar la factura con AFIP',
        action: `Detalle técnico: ${errorMessage.substring(0, 100)}. Contacte soporte si persiste.`,
        severity: 'error',
    };
}

/**
 * Formatea el error de AFIP para mostrar al usuario
 * @param error - Error original
 * @returns Mensaje formateado
 */
export function formatAfipErrorForUser(error: string | Error): string {
    const info = mapAfipError(error);
    return `${info.message}. ${info.action}`;
}
