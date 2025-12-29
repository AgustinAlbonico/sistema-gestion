/**
 * Hook para forzar refetch de datos al navegar entre rutas del sidebar.
 * Soluciona el problema de datos obsoletos causado por el caché de React Query.
 * 
 * Funcionamiento:
 * 1. Detecta cambios de ruta con useLocation()
 * 2. Mapea cada ruta a sus query keys correspondientes
 * 3. Invalida las queries al entrar a cada pantalla
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

// Mapeo de rutas del sidebar a query keys que deben invalidarse
const routeQueryKeyMap: Record<string, string[]> = {
    '/dashboard': ['reports', 'customer-accounts', 'sales', 'products'],
    '/sales': ['sales', 'products', 'customers'],
    '/cash-register': ['cash-register', 'sales', 'reports'],
    '/customer-accounts': ['customer-accounts', 'customers'],
    '/incomes': ['incomes', 'reports'],
    '/purchases': ['purchases', 'products', 'suppliers'],
    '/expenses': ['expenses', 'reports'],
    '/products': ['products'],
    '/customers': ['customers', 'customer-accounts'],
    '/suppliers': ['suppliers'],
    '/reports': ['reports', 'customer-accounts', 'sales', 'expenses', 'incomes', 'products', 'customers'],
    '/settings': ['settings', 'users', 'payment-methods', 'tax-types'],
};

/**
 * Hook que invalida las queries de React Query al cambiar de ruta.
 * Debe colocarse en el layout principal (DashboardLayout).
 */
export function useRouteRefresh(): void {
    const location = useLocation();
    const queryClient = useQueryClient();
    const prevPathRef = useRef<string>(location.pathname);

    useEffect(() => {
        const currentPath = location.pathname;

        // Solo invalidar si realmente cambió la ruta
        if (currentPath !== prevPathRef.current) {
            // Buscar la ruta base (sin parámetros dinámicos)
            const basePath = getBasePath(currentPath);
            const keysToInvalidate = routeQueryKeyMap[basePath];

            if (keysToInvalidate && keysToInvalidate.length > 0) {
                // Invalidar cada query key del mapeo
                keysToInvalidate.forEach((key) => {
                    queryClient.invalidateQueries({ queryKey: [key] });
                });
            }

            prevPathRef.current = currentPath;
        }
    }, [location.pathname, queryClient]);
}

/**
 * Extrae la ruta base de un pathname (sin parámetros dinámicos).
 * Ej: '/customer-accounts/123' → '/customer-accounts'
 */
function getBasePath(pathname: string): string {
    // Rutas conocidas que tienen subrutas con parámetros
    const routesWithParams = [
        '/customer-accounts',
        '/settings',
    ];

    for (const route of routesWithParams) {
        if (pathname.startsWith(route)) {
            return route;
        }
    }

    return pathname;
}
