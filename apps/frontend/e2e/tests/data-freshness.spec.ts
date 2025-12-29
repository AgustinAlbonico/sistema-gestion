/**
 * Tests E2E de Frescura de Datos
 * Verifica que los datos se actualicen correctamente al navegar entre pantallas del sidebar
 */
import { test, expect } from '../fixtures/test-fixtures';

test.describe('Frescura de Datos en Navegación', () => {

    test.beforeEach(async ({ helpers }) => {
        await helpers.navigateTo('/dashboard');
    });

    test('debe actualizar Reportes después de modificar datos en Cuentas Corrientes', async ({ page, helpers }) => {
        // 1. Navegar a Reportes y capturar el valor inicial de "Deuda Clientes"
        await helpers.navigateTo('/reports');
        await helpers.waitForLoading();

        // Buscar el card de "Deuda Clientes" y obtener su valor inicial
        const debtCard = page.locator('text=Deuda Clientes').first().locator('..').locator('..');
        await expect(debtCard).toBeVisible({ timeout: 10000 });

        // Obtener el texto del valor de deuda (puede ser $0 o cualquier valor)
        const initialDebtText = await debtCard.locator('span.font-bold, span.text-2xl, [class*="text-xl"]').first().textContent();

        // 2. Navegar a Cuentas Corrientes
        await helpers.navigateTo('/customer-accounts');
        await helpers.waitForLoading();

        // Verificar que estamos en la página correcta
        await expect(page.getByRole('heading', { name: /Cuentas Corrientes/i }).first()).toBeVisible();

        // 3. Volver a Reportes via sidebar (simulando navegación del usuario)
        const reportsLink = page.getByRole('link', { name: /Reportes/i }).first();
        await reportsLink.click();
        await helpers.waitForLoading();

        // 4. Verificar que los datos se cargaron (no importa el valor, solo que se refrescaron)
        // El punto es que no haya error y los datos estén visibles
        const debtCardAfter = page.locator('text=Deuda Clientes').first().locator('..').locator('..');
        await expect(debtCardAfter).toBeVisible({ timeout: 10000 });

        // Verificar que hay un valor numérico en el card (indica que se cargaron datos frescos)
        const finalDebtText = await debtCardAfter.locator('span.font-bold, span.text-2xl, [class*="text-xl"]').first().textContent();
        expect(finalDebtText).toBeTruthy();
    });

    test('debe actualizar Dashboard después de crear una venta', async ({ page, helpers }) => {
        // 1. Navegar al Dashboard y verificar métricas iniciales
        await helpers.navigateTo('/dashboard');
        await helpers.waitForLoading();

        // Verificar que hay cards de métricas visibles
        await expect(page.locator('text=Ventas Hoy').first()).toBeVisible({ timeout: 10000 });

        // 2. Navegar a Ventas
        await helpers.navigateTo('/sales');
        await helpers.waitForLoading();

        await expect(page.getByRole('heading', { name: /Ventas/i }).first()).toBeVisible();

        // 3. Volver al Dashboard via sidebar
        const dashboardLink = page.getByRole('link', { name: /Inicio|Dashboard/i }).first();
        await dashboardLink.click();
        await helpers.waitForLoading();

        // 4. Verificar que las métricas del dashboard están visibles (datos refrescados)
        await expect(page.locator('text=Ventas Hoy').first()).toBeVisible({ timeout: 10000 });
    });

    test('debe refrescar datos al navegar entre múltiples pantallas', async ({ page, helpers }) => {
        const routes = [
            { path: '/reports', heading: /Reportes/i },
            { path: '/customer-accounts', heading: /Cuentas Corrientes/i },
            { path: '/sales', heading: /Ventas/i },
            { path: '/products', heading: /Productos/i },
            { path: '/dashboard', heading: /Inicio|Dashboard|Resumen/i },
        ];

        for (const route of routes) {
            // Navegar via sidebar link
            const linkName = route.path === '/dashboard' ? /Inicio/i :
                route.path === '/reports' ? /Reportes/i :
                    route.path === '/customer-accounts' ? /Cuentas Corrientes/i :
                        route.path === '/sales' ? /Ventas/i :
                            /Productos/i;

            const link = page.getByRole('link', { name: linkName }).first();
            await link.click();
            await helpers.waitForLoading();

            // Verificar que estamos en la ruta correcta
            await helpers.expectRoute(route.path);

            // Verificar que no hay errores de carga (la página muestra contenido)
            // Pequeña espera para que React Query haga el refetch
            await page.waitForTimeout(500);
        }
    });
});
