/**
 * ConfirmDialog - Modal de confirmación para reemplazar window.confirm()
 * Compatible con Electron
 */
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

export interface ConfirmDialogOptions {
    /** Título del diálogo */
    title?: string;
    /** Descripción/mensaje del diálogo */
    description: string;
    /** Texto del botón de confirmación */
    confirmLabel?: string;
    /** Texto del botón de cancelación */
    cancelLabel?: string;
    /** Variante de estilo del botón de confirmación */
    variant?: 'default' | 'danger' | 'warning';
}

interface ConfirmDialogProps extends ConfirmDialogOptions {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

// Estilos para variantes del botón de confirmación
const confirmButtonVariants = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    warning: 'bg-amber-500 text-white hover:bg-amber-600',
};

export function ConfirmDialog({
    open,
    title = 'Confirmar acción',
    description,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    variant = 'default',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onCancel}>
                        {cancelLabel}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        className={cn(confirmButtonVariants[variant])}
                    >
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
