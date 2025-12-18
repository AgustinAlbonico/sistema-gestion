/**
 * Interfaces compartidas para autenticación
 */
import { Request } from 'express';

/**
 * Payload del usuario autenticado (lo que devuelve JwtStrategy.validate())
 */
export interface AuthUser {
    userId: string;
    username: string;
}

/**
 * Request con usuario autenticado
 * Usar en controllers con @Request() req: AuthenticatedRequest
 */
export interface AuthenticatedRequest extends Request {
    user: AuthUser;
}

/**
 * DTO para pagos (usado en markAsPaid)
 */
export interface PaymentDto {
    paymentMethodId: string;
    amount: number;
    installments?: number;
    cardLastFourDigits?: string;
    authorizationCode?: string;
    referenceNumber?: string;
    notes?: string;
}
