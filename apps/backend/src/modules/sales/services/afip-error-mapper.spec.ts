/**
 * Tests unitarios para AFIP Error Mapper
 * FIX 4.1: Validar que los errores técnicos se mapean correctamente
 */
import { mapAfipError, formatAfipErrorForUser } from './afip-error-mapper';

describe('AfipErrorMapper', () => {
    describe('mapAfipError', () => {
        it('debe mapear errores de autenticación', () => {
            const result = mapAfipError('Token invalid or expired');

            expect(result.message).toContain('autenticación');
            expect(result.severity).toBe('error');
        });

        it('debe mapear errores de certificado expirado', () => {
            const result = mapAfipError('certificate expired');

            expect(result.message).toContain('expirado');
            expect(result.action).toContain('renovar');
            expect(result.severity).toBe('error');
        });

        it('debe mapear errores de CUIT inválido', () => {
            const result = mapAfipError('CUIT invalido o no registrado');

            expect(result.message).toContain('CUIT');
            expect(result.severity).toBe('error');
        });

        it('debe mapear errores de timeout/conexión', () => {
            const result = mapAfipError('ETIMEDOUT connecting to AFIP');

            expect(result.message).toContain('conectar');
            expect(result.action).toContain('minutos');
            expect(result.severity).toBe('warning');
        });

        it('debe mapear errores de comprobante duplicado', () => {
            const result = mapAfipError('comprobante duplicado ya existe');

            expect(result.message).toContain('ya fue emitido');
            expect(result.severity).toBe('warning');
        });

        it('debe mapear errores de punto de venta', () => {
            const result = mapAfipError('PtoVta no autorizado');

            expect(result.message).toContain('punto de venta');
            expect(result.action).toContain('Configure');
            expect(result.severity).toBe('error');
        });

        it('debe retornar error genérico para errores desconocidos', () => {
            const result = mapAfipError('Error completamente desconocido XYZ123');

            expect(result.message).toContain('Error al procesar');
            expect(result.action).toContain('Detalle técnico');
            expect(result.severity).toBe('error');
        });

        it('debe aceptar instancias de Error', () => {
            const error = new Error('Token invalid');
            const result = mapAfipError(error);

            expect(result.message).toContain('autenticación');
        });
    });

    describe('formatAfipErrorForUser', () => {
        it('debe formatear mensaje y acción juntos', () => {
            const result = formatAfipErrorForUser('certificate expired');

            expect(result).toContain('expirado');
            expect(result).toContain('renovar');
        });

        it('debe incluir detalle técnico para errores desconocidos', () => {
            const result = formatAfipErrorForUser('Error técnico XYZ');

            expect(result).toContain('XYZ');
        });
    });
});
