/**
 * ConfirmProvider - Provider global para modales de confirmación
 * Permite usar confirm() de forma imperativa en cualquier componente
 */
import { createContext, useState, useCallback, ReactNode } from 'react';
import { ConfirmDialog, ConfirmDialogOptions } from '@/components/ui/confirm-dialog';

interface ConfirmContextValue {
    confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
}

export const ConfirmContext = createContext<ConfirmContextValue | null>(null);

interface ConfirmProviderProps {
    children: ReactNode;
}

interface ConfirmState extends ConfirmDialogOptions {
    resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: ConfirmProviderProps) {
    const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

    const confirm = useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setConfirmState({ ...options, resolve });
        });
    }, []);

    const handleConfirm = useCallback(() => {
        if (confirmState) {
            confirmState.resolve(true);
            setConfirmState(null);
        }
    }, [confirmState]);

    const handleCancel = useCallback(() => {
        if (confirmState) {
            confirmState.resolve(false);
            setConfirmState(null);
        }
    }, [confirmState]);

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            {confirmState && (
                <ConfirmDialog
                    open={true}
                    title={confirmState.title}
                    description={confirmState.description}
                    confirmLabel={confirmState.confirmLabel}
                    cancelLabel={confirmState.cancelLabel}
                    variant={confirmState.variant}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                />
            )}
        </ConfirmContext.Provider>
    );
}
