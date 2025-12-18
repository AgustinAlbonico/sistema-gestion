/**
 * useConfirm - Hook para mostrar modales de confirmación
 * Reemplaza el uso de window.confirm() nativo
 */
import { useContext } from 'react';
import { ConfirmContext } from '@/components/ConfirmProvider';
import { ConfirmDialogOptions } from '@/components/ui/confirm-dialog';

/**
 * Hook que retorna una función confirm() que abre un modal de confirmación
 * 
 * @example
 * const confirm = useConfirm();
 * 
 * const handleDelete = async () => {
 *     const confirmed = await confirm({
 *         title: 'Eliminar producto',
 *         description: '¿Estás seguro de eliminar este producto?',
 *         variant: 'danger',
 *     });
 *     if (confirmed) {
 *         deleteMutation.mutate(id);
 *     }
 * };
 */
export function useConfirm() {
    const context = useContext(ConfirmContext);

    if (!context) {
        throw new Error('useConfirm debe usarse dentro de un ConfirmProvider');
    }

    return context.confirm;
}

// Re-exportar tipos para conveniencia
export type { ConfirmDialogOptions };
