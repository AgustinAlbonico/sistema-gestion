import { useQuery } from '@tanstack/react-query';
import { salesApi } from '../api/sales.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import {
    User,
    Calendar,
    CreditCard,
    FileText,
    Receipt,
    AlertTriangle,
    ShoppingCart,
    Package,
    DollarSign,
    TrendingDown,
    Percent,
    CheckCircle2,
    Clock,
    XCircle,
    Landmark,
    Wallet,
    Loader2,
} from 'lucide-react';
import {
    Sale,
    SaleStatusLabels,
    PaymentMethodLabels,
    InvoiceStatus,
} from '../types';
import { formatDateForDisplay } from '@/lib/date-utils';
import { InvoiceActions } from './InvoiceActions';

interface SaleDetailProps {
    readonly sale?: Sale;
    readonly saleId?: string;
    readonly open: boolean;
    readonly onClose: () => void;
}

/**
 * Formatea un número como moneda ARS
 */
function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
    }).format(value);
}

/**
 * Obtiene estilo del estado de la venta
 */
function getStatusStyle(status: Sale['status']) {
    switch (status) {
        case 'completed':
            return {
                icon: CheckCircle2,
                className: 'bg-green-500/30 text-white border-green-400/50',
            };
        case 'pending':
            return {
                icon: Clock,
                className: 'bg-yellow-500/30 text-white border-yellow-400/50',
            };
        case 'cancelled':
            return {
                icon: XCircle,
                className: 'bg-red-500/30 text-white border-red-400/50',
            };
        default:
            return {
                icon: Clock,
                className: 'bg-slate-500/30 text-white border-slate-400/50',
            };
    }
}

export function SaleDetail({ sale: initialSale, saleId, open, onClose }: SaleDetailProps) {
    const { data: fetchedSale, isLoading } = useQuery({
        queryKey: ['sale', saleId],
        queryFn: () => (saleId ? salesApi.getOne(saleId) : Promise.resolve(null)),
        enabled: !initialSale && !!saleId && open,
    });

    const sale = initialSale || fetchedSale;

    if (!open) return null;

    if (isLoading) {
        return (
            <Dialog open={open} onOpenChange={onClose}>
                <DialogContent className="flex items-center justify-center min-h-[300px]">
                    <DialogTitle className="sr-only">Cargando venta</DialogTitle>
                    <DialogDescription className="sr-only">Espere mientras se cargan los detalles de la venta.</DialogDescription>
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </DialogContent>
            </Dialog>
        );
    }

    if (!sale) return null;

    const statusStyle = getStatusStyle(sale.status);
    const StatusIcon = statusStyle.icon;

    /**
     * Obtiene el nombre del cliente
     */
    const getCustomerName = (): string => {
        if (sale.customer) {
            return `${sale.customer.firstName} ${sale.customer.lastName}`;
        }
        return sale.customerName || 'Consumidor Final';
    };

    /**
     * Obtiene el nombre del vendedor
     */
    const getSellerName = (): string => {
        if (sale.createdBy) {
            return `${sale.createdBy.firstName} ${sale.createdBy.lastName}`;
        }
        return '-';
    };

    const hasInvoiceError = sale.fiscalPending ||
        sale.invoice?.status === InvoiceStatus.REJECTED ||
        sale.invoice?.status === InvoiceStatus.ERROR;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden max-h-[90vh] overflow-y-auto">
                <DialogTitle className="sr-only">Detalle de Venta {sale.saleNumber}</DialogTitle>
                <DialogDescription className="sr-only">
                    Detalles completos de la venta {sale.saleNumber}, incluyendo productos, pagos y estado.
                </DialogDescription>
                {/* Header con gradiente */}
                <div className="bg-gradient-to-br from-primary/90 via-primary to-primary/80 px-6 py-5 text-primary-foreground sticky top-0 z-10">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                            <ShoppingCart className="h-6 w-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-xl font-bold tracking-tight">
                                Venta {sale.saleNumber}
                            </h2>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <Badge
                                    variant="secondary"
                                    className={statusStyle.className}
                                >
                                    <StatusIcon className="h-3 w-3 mr-1" />
                                    {SaleStatusLabels[sale.status]}
                                </Badge>
                                {sale.isOnAccount ? (
                                    <Badge
                                        variant="secondary"
                                        className="bg-blue-500/30 text-white border-blue-400/50"
                                    >
                                        <Landmark className="h-3 w-3 mr-1" />
                                        Cuenta Corriente
                                    </Badge>
                                ) : null}
                                {hasInvoiceError ? (
                                    <Badge
                                        variant="secondary"
                                        className="bg-orange-500/30 text-white border-orange-400/50"
                                    >
                                        <AlertTriangle className="h-3 w-3 mr-1" />
                                        Error Factura
                                    </Badge>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>

                {/* FIX Issue #6: Alerta prominente de error fiscal */}
                {hasInvoiceError && (sale.fiscalError || sale.invoice?.afipErrorMessage) && (
                    <div className="mx-6 mt-4 p-4 rounded-lg bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold text-orange-800 dark:text-orange-200">
                                    Error en Facturación Fiscal
                                </h4>
                                <p className="text-sm text-orange-700 dark:text-orange-300 mt-1 break-words">
                                    {sale.fiscalError || sale.invoice?.afipErrorMessage || 'Error desconocido al generar la factura fiscal.'}
                                </p>
                                <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                                    Puede reintentar la facturación desde la sección "Facturación" más abajo.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Contenido principal */}
                <div className="p-6 space-y-5">
                    {/* Información general */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-1.5 mb-1">
                                <Calendar className="h-3 w-3 text-muted-foreground" />
                                <p className="text-xs text-muted-foreground">Fecha</p>
                            </div>
                            <p className="text-sm font-semibold">
                                {formatDateForDisplay(sale.saleDate)}
                            </p>
                        </div>
                        <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-1.5 mb-1">
                                <User className="h-3 w-3 text-muted-foreground" />
                                <p className="text-xs text-muted-foreground">Cliente</p>
                            </div>
                            <p className="text-sm font-semibold truncate" title={getCustomerName()}>
                                {getCustomerName()}
                            </p>
                        </div>
                        <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3 border border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-1.5 mb-1">
                                <User className="h-3 w-3 text-muted-foreground" />
                                <p className="text-xs text-muted-foreground">Vendedor</p>
                            </div>
                            <p className="text-sm font-semibold">
                                {getSellerName()}
                            </p>
                        </div>
                        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3 border border-blue-200 dark:border-blue-800/50">
                            <div className="flex items-center gap-1.5 mb-1">
                                <Wallet className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                <p className="text-xs text-blue-600 dark:text-blue-400">Tipo</p>
                            </div>
                            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                                {sale.isOnAccount ? 'Cuenta Corriente' : 'Contado'}
                            </p>
                        </div>
                    </div>

                    <Separator />

                    {/* Items de la venta */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Productos ({sale.items?.length || 0})
                            </span>
                        </div>

                        <div className="rounded-xl border border-border/50 overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                                        <TableHead className="font-semibold">Producto</TableHead>
                                        <TableHead className="text-center font-semibold">Cant.</TableHead>
                                        <TableHead className="text-right font-semibold">P. Unit.</TableHead>
                                        <TableHead className="text-right font-semibold">Desc.</TableHead>
                                        <TableHead className="text-right font-semibold">Subtotal</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sale.items?.map((item, index) => (
                                        <TableRow
                                            key={item.id}
                                            className={index % 2 === 0 ? 'bg-transparent' : 'bg-muted/10'}
                                        >
                                            <TableCell>
                                                <div>
                                                    <p className="font-medium">
                                                        {item.productDescription}
                                                    </p>
                                                    {item.productCode ? (
                                                        <p className="text-xs text-muted-foreground">
                                                            SKU: {item.productCode}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center font-medium">
                                                {item.quantity}
                                            </TableCell>
                                            <TableCell className="text-right text-muted-foreground">
                                                {formatCurrency(item.unitPrice)}
                                            </TableCell>
                                            <TableCell className="text-right text-green-600 dark:text-green-400">
                                                {item.discount > 0
                                                    ? `-${formatCurrency(item.discount)}`
                                                    : '-'}
                                            </TableCell>
                                            <TableCell className="text-right font-semibold">
                                                {formatCurrency(item.subtotal)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    <Separator />

                    {/* Totales */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Resumen de Pago
                            </span>
                        </div>

                        <div className="flex justify-end">
                            <div className="w-72 space-y-2">
                                <div className="rounded-xl bg-muted/40 p-4 border border-border/50 space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">Subtotal:</span>
                                        <span className="font-medium">{formatCurrency(sale.subtotal)}</span>
                                    </div>
                                    {sale.discount > 0 ? (
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                                                <TrendingDown className="h-3.5 w-3.5" />
                                                <span>Descuento:</span>
                                            </div>
                                            <span className="font-medium text-green-600 dark:text-green-400">
                                                -{formatCurrency(sale.discount)}
                                            </span>
                                        </div>
                                    ) : null}
                                    {sale.tax > 0 ? (
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                                <Percent className="h-3.5 w-3.5" />
                                                <span>Impuestos:</span>
                                            </div>
                                            <span className="font-medium">{formatCurrency(sale.tax)}</span>
                                        </div>
                                    ) : null}
                                </div>

                                {/* Total destacado */}
                                <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/50 dark:to-green-950/50 p-4 border border-emerald-200 dark:border-emerald-800/50 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                                            TOTAL
                                        </span>
                                        <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                            {formatCurrency(sale.total)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Pagos */}
                    {sale.payments && sale.payments.length > 0 ? (
                        <>
                            <Separator />
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Pagos ({sale.payments.length})
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {sale.payments.map((payment) => (
                                        <div
                                            key={payment.id}
                                            className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-primary/10 rounded-lg">
                                                    <CreditCard className="h-4 w-4 text-primary" />
                                                </div>
                                                <div>
                                                    <p className="font-medium">
                                                        {(payment.paymentMethod as any)?.name || PaymentMethodLabels[payment.paymentMethod]}
                                                    </p>
                                                    <div className="flex gap-2 text-xs text-muted-foreground">
                                                        {payment.installments ? (
                                                            <span>{payment.installments} cuotas</span>
                                                        ) : null}
                                                        {payment.cardLastFourDigits ? (
                                                            <span>**** {payment.cardLastFourDigits}</span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                            <span className="font-semibold text-lg">
                                                {formatCurrency(payment.amount)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : null}

                    {/* Notas */}
                    {sale.notes ? (
                        <>
                            <Separator />
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Notas
                                    </span>
                                </div>
                                <div className="rounded-xl bg-muted/40 p-4 border border-border/50">
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                        {sale.notes}
                                    </p>
                                </div>
                            </div>
                        </>
                    ) : null}

                    {/* Facturación */}
                    <Separator />
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Receipt className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Facturación
                            </span>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-4 border border-border/50">
                            <InvoiceActions sale={sale} invoice={sale.invoice} />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end p-4 pt-0">
                    <Button variant="outline" onClick={onClose}>
                        Cerrar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
