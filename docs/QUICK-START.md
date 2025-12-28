# Quick Start - NexoPOS Desktop

Guía rápida para poner en marcha NexoPOS en 5 minutos.

## ✅ Lo que necesitás (checklist)

### Usuario Final (Producción)

- [ ] **PostgreSQL 14+** (instalado y corriendo)
- [ ] **NexoPOS-Setup-1.0.4.exe** (descargado)

**¡ESO ES TODO!** Node.js está incluido en el instalador.

### Desarrollo

- [ ] **PostgreSQL 14+** (instalado y corriendo)
- [ ] **Node.js 18.x o 20.x** (para compilar y desarrollar)
- [ ] **Git** (para clonar el repositorio)

---

### Usuario Final (Producción) - Pasos

1. Instalar PostgreSQL
2. Crear base de datos `nexopos`
3. Descargar `NexoPOS-Setup-1.0.4.exe`
4. Ejecutar el instalador

**Listo**. El Setup Wizard te guía en el resto.

> **Importante**: NO necesitás instalar Node.js por separado. Está incluido en Electron.

---

## 🚀 Instalación Rápida - Desarrollo

```powershell
# 1. Clonar repo
git clone https://github.com/AgustinAlbonico/sistema-gestion.git
cd sistema-gestion

# 2. Instalar dependencias
npm install

# 3. Configurar .env
cp env.template .env
# Editar .env con tus datos de PostgreSQL

# 4. Ejecutar migraciones
npm run migration:run --workspace=@sistema/backend

# 5. Ejecutar app
npm run dev
```

**¡Listo!** La app abre en Electron automáticamente.

---

## 📝 Archivo .env Mínimo

```env
# Base de datos
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=nexopos
DATABASE_USER=postgres
DATABASE_PASSWORD=tu_password

# Backend
BACKEND_PORT=3000

# Seguridad
JWT_SECRET=un_secret_super_largo_y_seguro_minimo_32_caracteres
JWT_EXPIRATION=8h
```

---

## 🔨 Build del Instalador

```powershell
cd apps/desktop
npm run build
```

**Resultado**: `apps/desktop/release/NexoPOS-Setup-1.0.4.exe`

---

## 🐛 Problemas Comunes

### Error: "Cannot find module"
```powershell
cd apps/desktop
node scripts/copy-backend-deps.js
npm run package
```

### Error: "ECONNREFUSED" (PostgreSQL)
```powershell
# Verificar que PostgreSQL esté corriendo
Get-Service postgresql*

# Iniciar si está detenido
Start-Service postgresql-x64-15
```

### Puerto 3000 ocupado
```powershell
# Matar proceso en puerto 3000
netstat -ano | findstr :3000
taskkill /F /PID [PID]

# O cambiar puerto en .env
BACKEND_PORT=3001
```

---

## 📚 Documentación Completa

- **[REQUISITOS-SISTEMA.md](./REQUISITOS-SISTEMA.md)** - Todo lo que necesitás saber
- **[DEPENDENCIAS-INSTALADOR.md](./DEPENDENCIAS-INSTALADOR.md)** - Dependencias del build
- **[README.md](./README.md)** - Índice completo de docs

---

## 🎯 Comandos Útiles

```powershell
# Desarrollo
npm run dev                    # Ejecutar todo (frontend + backend + electron)
npm run build                  # Compilar todo
npm run test                   # Ejecutar tests

# Migraciones
npm run migration:run --workspace=@sistema/backend       # Ejecutar
npm run migration:revert --workspace=@sistema/backend    # Revertir
npm run migration:create --workspace=@sistema/backend -- NombreMigracion

# Desktop
cd apps/desktop
npm run dev                    # Solo Electron (requiere backend/frontend corriendo)
npm run build                  # Build completo + instalador
npm run package                # Solo crear instalador (sin build)
```

---

**¿Dudas?** Lee [REQUISITOS-SISTEMA.md](./REQUISITOS-SISTEMA.md) para detalles completos.

