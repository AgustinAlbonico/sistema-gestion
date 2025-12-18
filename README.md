# 🧾 NexoPOS - Sistema de Punto de Venta

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-47848F?style=flat&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)

> 💼 Sistema POS para comercios argentinos. Facturación electrónica AFIP (A/B/C), ventas multi-pago, stock en tiempo real, cuentas corrientes, auditoría y backups. Stack moderno: NestJS + React + TypeScript + Electron. Desktop-first con soporte offline.

---

Sistema de gestión comercial integral diseñado para pequeñas y medianas empresas argentinas. Funciona como aplicación de escritorio (Electron) con base de datos local, sin depender de conexión a internet para operar.

### 🎯 Diferenciadores

- **AFIP Nativo** - Facturación electrónica integrada (no como add-on)
- **Desktop Offline** - No depende de internet para funcionar
- **Multi-vertical** - Adapatable a cualquier rubro comercial
- **Open Source** - Código abierto y personalizable

---

## ✨ Características Principales

### 🛒 Punto de Venta (POS)
- Registro rápido de ventas con búsqueda de productos
- Múltiples métodos de pago (efectivo, tarjeta, transferencia, etc.)
- Descuentos y recargos (porcentaje o monto fijo)
- Aplicación de impuestos configurables
- Ventas a cuenta corriente de clientes

### 💰 Caja Registradora
- Apertura y cierre de caja con monto inicial
- Seguimiento de todos los movimientos (ventas, compras, gastos, ingresos)
- Resumen de totales por método de pago
- Historial completo de cajas anteriores
- Alertas de caja no cerrada del día anterior

### 📦 Gestión de Productos
- Catálogo de productos con categorías
- Control de stock con historial de movimientos
- Alertas de stock bajo
- Márgenes de ganancia configurables (por producto, categoría o general)
- Cálculo automático de precios de venta

### 👥 Clientes y Cuentas Corrientes
- Base de datos de clientes con datos fiscales
- Cuentas corrientes con límite de crédito
- Estados de cuenta detallados
- Registro de pagos y movimientos
- Historial de compras por cliente

### 🧾 Facturación Electrónica AFIP
- Integración con AFIP Argentina (homologación y producción)
- Emisión de facturas A, B y C
- Gestión automática de tokens WSAA
- Almacenamiento de CAE y comprobantes
- Configuración de certificados y CUIT

### 🛍️ Compras y Proveedores
- Registro de compras a proveedores
- Gestión de proveedores con datos de contacto
- Actualización automática de stock
- Seguimiento de compras pendientes de pago

### 💸 Gastos e Ingresos
- Registro de gastos operativos por categoría
- Registro de ingresos adicionales
- Integración con caja registradora
- Estados de pago (pendiente/pagado)

### 📊 Reportes y Estadísticas
- Dashboard con métricas principales
- Reportes por período (día, semana, mes, año)
- Productos más vendidos
- Clientes más frecuentes
- Gráficos de ventas, compras y gastos

### ⚙️ Configuración
- Métodos de pago personalizables
- Tipos de impuestos configurables
- Margen de ganancia general
- Configuración fiscal (CUIT, punto de venta, certificados)
- Gestión de usuarios del sistema

---

## 📋 Requisitos Previos

- **Node.js** 20 LTS o superior
- **pnpm** (gestor de paquetes)
- **Docker** y **Docker Compose** (para base de datos)

## 🚀 Setup Inicial

### 1. Clonar el repositorio

```bash
git clone https://github.com/AgustinAlbonico/sistema-gestion.git
cd sistema-gestion
```

### 2. Instalar pnpm (si no lo tienes)

```bash
npm install -g pnpm
```

### 3. Instalar dependencias

```bash
pnpm install
```

### 4. Configurar variables de entorno

Copiar el archivo de template y ajustar valores:

```bash
# En Windows PowerShell
Copy-Item env.template .env

# En Linux/Mac
cp env.template .env
```

Editar el archivo `.env` con tus valores:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=sistema_gestion
BACKEND_PORT=3000
FRONTEND_URL=http://localhost:5173
VITE_API_URL=http://localhost:3000
```

### 5. Levantar la base de datos con Docker

```bash
docker-compose up -d
```

Esto levantará:
- **PostgreSQL** en el puerto `5432` 
- **Redis** en el puerto `6379`

### 6. Ejecutar el proyecto en modo desarrollo

```bash
pnpm dev
```

Este comando ejecutará **simultáneamente**:
- Backend en `http://localhost:3000`
- Frontend en `http://localhost:5173`

---

## 📦 Estructura del Proyecto

```
sistema-gestion/
├── apps/
│   ├── backend/          # NestJS API
│   │   └── src/
│   │       └── modules/  # Módulos del sistema
│   │           ├── auth/             # Autenticación
│   │           ├── sales/            # Ventas
│   │           ├── products/         # Productos
│   │           ├── customers/        # Clientes
│   │           ├── customer-accounts/# Cuentas corrientes
│   │           ├── cash-register/    # Caja registradora
│   │           ├── purchases/        # Compras
│   │           ├── suppliers/        # Proveedores
│   │           ├── expenses/         # Gastos
│   │           ├── incomes/          # Ingresos
│   │           ├── reports/          # Reportes
│   │           ├── inventory/        # Inventario
│   │           └── configuration/    # Configuración
│   │
│   └── frontend/         # React + Vite
│       └── src/
│           ├── features/ # Módulos por funcionalidad
│           ├── pages/    # Páginas de la aplicación
│           └── components/ # Componentes reutilizables
│
├── packages/             # Paquetes compartidos
├── docs/                 # Documentación
├── scripts/              # Scripts de utilidad
└── docker-compose.yml    # Contenedores de desarrollo
```

## 🛠️ Comandos Disponibles

```bash
pnpm dev          # Ejecutar backend + frontend en paralelo
pnpm build        # Compilar todo el proyecto
pnpm lint         # Ejecutar linter
pnpm test         # Ejecutar tests
```

## 📚 Stack Tecnológico

### Backend
- **Framework**: NestJS 10
- **ORM**: TypeORM 0.3
- **Database**: PostgreSQL 15
- **Cache**: Redis 7
- **Validación**: Zod + class-validator

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite 5
- **Estilos**: Tailwind CSS 3 + shadcn/ui
- **HTTP Client**: Axios
- **Formularios**: React Hook Form + Zod

### Infraestructura
- **Monorepo**: Turborepo + pnpm workspaces
- **Containers**: Docker + Docker Compose

---

## 📖 Documentación Adicional

- [📋 Planificación y Roadmap](./docs/planificacion-nexopos.md)
- [🔐 Guía de Certificados AFIP/ARCA](./docs/guia-certificados-arca.md)
- [📦 Guía de Instalación](./docs/guia-instalacion.md)
- [🔧 Stack Tecnológico Completo](./docs/stack-tecnologico.md)
- [🐳 Docker Setup](./docs/DOCKER-SETUP-COMPLETO.md)
- [📊 Estado del Sistema](./docs/estado-sistema.md)

## 📝 Licencia

Privado - Todos los derechos reservados
