# Requisitos del Sistema - NexoPOS

Documentación completa de los requisitos para ejecutar NexoPOS Desktop en desarrollo y producción.

## Tabla de Contenidos

- [Requisitos de Hardware](#requisitos-de-hardware)
- [Requisitos de Software](#requisitos-de-software)
- [Dependencias del Sistema](#dependencias-del-sistema)
- [Configuración Inicial](#configuración-inicial)
- [Estructura de Archivos](#estructura-de-archivos)
- [Ejecución en Desarrollo](#ejecución-en-desarrollo)
- [Ejecución en Producción](#ejecución-en-producción)
- [Troubleshooting](#troubleshooting)

---

## Requisitos de Hardware

### Mínimos (Desarrollo)
- **Procesador**: Intel Core i3 o equivalente
- **RAM**: 8 GB
- **Disco**: 10 GB libres (5 GB para node_modules + 5 GB para desarrollo)
- **Pantalla**: 1024x768

### Recomendados (Desarrollo)
- **Procesador**: Intel Core i5/i7 o equivalente
- **RAM**: 16 GB
- **Disco SSD**: 20 GB libres
- **Pantalla**: 1920x1080

### Mínimos (Producción - Cliente Final)
- **Procesador**: Intel Core i3 o equivalente
- **RAM**: 4 GB
- **Disco**: 2 GB libres
- **Pantalla**: 1024x768

---

## Requisitos de Software

### Sistema Operativo

#### Windows (Soportado)
- **Windows 10** (versión 1809 o superior)
- **Windows 11** (todas las versiones)
- Arquitectura: x64

#### Linux (Futuro)
- Ubuntu 20.04+
- Debian 11+
- Fedora 36+

#### macOS (Futuro)
- macOS 11 Big Sur o superior

### Software Base Requerido

#### Para Desarrollo

| Software | Versión | Propósito |
|----------|---------|-----------|
| **Node.js** | 18.x o 20.x | Runtime de JavaScript |
| **npm** | 9.x o 10.x | Gestor de paquetes |
| **PostgreSQL** | 14.x, 15.x o 16.x | Base de datos |
| **Git** | 2.x | Control de versiones |

#### Para Producción (Usuario Final)

| Software | Versión | Propósito | Incluido en Instalador |
|----------|---------|-----------|------------------------|
| **PostgreSQL** | 14.x+ | Base de datos | ❌ No (instalación separada) |
| **Node.js** | 25.x | Runtime del backend | ✅ Sí (incluido en Electron) |
| **NexoPOS Desktop** | 1.0.4+ | Aplicación | ✅ Sí (instalador .exe) |

> **Nota**: Node.js está incluido dentro del runtime de Electron. El usuario final NO necesita instalar Node.js por separado.

---

## Dependencias del Sistema

### 1. PostgreSQL

#### Instalación en Windows

**Opción A: Instalador Oficial**
1. Descargar de [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)
2. Ejecutar el instalador
3. Configurar:
   - **Puerto**: 5432 (por defecto)
   - **Usuario**: postgres
   - **Contraseña**: [tu contraseña segura]
   - **Locale**: Spanish, Argentina (es_AR) o English (en_US)

**Opción B: Instalación Portátil**
1. Descargar PostgreSQL Portable
2. Extraer en `C:\PostgreSQL`
3. Inicializar el cluster de base de datos

#### Configuración Requerida

```sql
-- Crear base de datos
CREATE DATABASE nexopos
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'Spanish_Argentina.1252'
    LC_CTYPE = 'Spanish_Argentina.1252'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1;

-- Verificar conexión
\c nexopos
```

#### Extensiones Requeridas

Ninguna extensión adicional es requerida. El sistema usa PostgreSQL estándar.

### 2. Node.js

#### Para Usuario Final (Producción)

**NO ES NECESARIO INSTALAR Node.js** - está incluido dentro de Electron.

El instalador de NexoPOS incluye el runtime de Node.js (versión 25.x) dentro del paquete de Electron, por lo que el usuario final no necesita instalarlo por separado.

#### Para Desarrollo

1. Descargar de [nodejs.org](https://nodejs.org/)
2. Instalar la versión LTS (Long Term Support) - 18.x o 20.x
3. Verificar instalación:

```powershell
node --version  # Debe mostrar v18.x.x o v20.x.x
npm --version   # Debe mostrar 9.x.x o 10.x.x
```

#### Configuración de npm (Opcional para Desarrollo)

```powershell
# Configurar cache de npm en disco local
npm config set cache C:\npm-cache

# Aumentar timeout para instalaciones lentas
npm config set timeout 60000

# Usar registry de npm oficial
npm config set registry https://registry.npmjs.org/
```

---

## Configuración Inicial

### 1. Variables de Entorno

El sistema usa un archivo `.env` para la configuración. La ubicación depende del entorno:

#### Desarrollo
**Ubicación**: Raíz del monorepo (`sistema-gestion/.env`)

```env
# ========================================
# Configuración de Base de Datos
# ========================================
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=nexopos
DATABASE_USER=postgres
DATABASE_PASSWORD=tu_password_aqui

# ========================================
# Configuración del Backend
# ========================================
BACKEND_PORT=3000

# ========================================
# Configuración del Frontend
# ========================================
FRONTEND_PORT=5173

# ========================================
# Configuración de Seguridad
# ========================================
NODE_ENV=development
JWT_SECRET=tu_secret_jwt_super_seguro_aqui_minimo_32_caracteres
JWT_EXPIRATION=8h

# ========================================
# Configuración de AFIP (Opcional)
# ========================================
AFIP_ENVIRONMENT=homologacion
AFIP_CUIT=20123456789
# Certificados se guardan en apps/backend/temp/certificates/
```

#### Producción (Instalador)

**Ubicación**: `%APPDATA%\@sistema\desktop\.env`

El archivo se crea automáticamente durante el Setup Wizard en la primera ejecución.

**Ruta completa típica**:
```
C:\Users\[usuario]\AppData\Roaming\@sistema\desktop\.env
```

### 2. Certificados AFIP (Opcional)

Si vas a emitir facturas electrónicas, necesitás certificados de AFIP.

**Ubicación en desarrollo**:
```
apps/backend/temp/certificates/
  ├── cert.crt      # Certificado público
  └── private.key   # Clave privada
```

**Ubicación en producción**:
```
%APPDATA%\@sistema\desktop\certificates\
  ├── cert.crt
  └── private.key
```

**Generación de certificados**: Ver [guia-certificados-arca.md](./tecnica/guia-certificados-arca.md)

---

## Estructura de Archivos

### Monorepo (Desarrollo)

```
sistema-gestion/
├── apps/
│   ├── backend/          # Backend NestJS
│   │   ├── src/          # Código fuente
│   │   ├── dist/         # Compilado TypeScript
│   │   ├── dist-bundle/  # Bundleado con Webpack
│   │   └── package.json
│   │
│   ├── frontend/         # Frontend React
│   │   ├── src/          # Código fuente
│   │   ├── dist/         # Build de producción
│   │   └── package.json
│   │
│   └── desktop/          # Electron Desktop
│       ├── electron/     # Main process
│       ├── scripts/      # Scripts de build
│       ├── dist/         # Compilado
│       ├── release/      # Instaladores generados
│       └── package.json
│
├── docs/                 # Documentación
├── packages/
│   └── shared/           # Código compartido
├── .env                  # Configuración (NO commitear)
├── package.json          # Workspace root
└── turbo.json           # Configuración de Turborepo
```

### Instalación (Producción)

```
C:\Users\[usuario]\AppData\Local\Programs\@sistemadesktop\
├── NexoPOS.exe                    # Ejecutable principal
├── resources/
│   ├── app.asar                   # Aplicación empaquetada
│   ├── backend/
│   │   ├── dist/
│   │   │   └── main.js           # Backend bundleado
│   │   └── node_modules/         # Dependencias de runtime
│   │       ├── express/
│   │       ├── pg/
│   │       └── ... (80 módulos)
│   └── setup/
│       └── index.html             # Setup Wizard
└── locales/                       # Traducciones de Electron

C:\Users\[usuario]\AppData\Roaming\@sistema\desktop\
├── .env                           # Configuración del usuario
├── logs/
│   └── main.log                  # Logs de la aplicación
└── certificates/                  # Certificados AFIP (opcional)
```

---

## Ejecución en Desarrollo

### Setup Inicial

```powershell
# 1. Clonar repositorio
git clone https://github.com/AgustinAlbonico/sistema-gestion.git
cd sistema-gestion

# 2. Instalar dependencias (puede tardar 5-10 minutos)
npm install

# 3. Crear archivo .env
cp env.template .env
# Editar .env con tus credenciales de PostgreSQL

# 4. Ejecutar migraciones de base de datos
npm run migration:run --workspace=@sistema/backend
```

### Ejecutar en Desarrollo

#### Opción A: Monorepo Completo (Recomendado)

```powershell
# Ejecuta backend, frontend y desktop simultáneamente
npm run dev
```

Esto inicia:
- Backend en `http://localhost:3000`
- Frontend en `http://localhost:5173`
- Electron Desktop (carga frontend desde localhost:5173)

#### Opción B: Componentes Individuales

```powershell
# Terminal 1: Backend
npm run dev --workspace=@sistema/backend

# Terminal 2: Frontend
npm run dev --workspace=@sistema/frontend

# Terminal 3: Desktop (requiere backend y frontend corriendo)
npm run dev --workspace=@sistema/desktop
```

### Comandos Útiles de Desarrollo

```powershell
# Compilar TypeScript (sin ejecutar)
npm run build

# Ejecutar tests
npm run test --workspace=@sistema/backend
npm run test:e2e --workspace=@sistema/frontend

# Linting
npm run lint

# Crear migración de base de datos
npm run migration:create --workspace=@sistema/backend -- NombreDeLaMigracion

# Revertir última migración
npm run migration:revert --workspace=@sistema/backend

# Ver logs de base de datos
npm run typeorm:log --workspace=@sistema/backend
```

---

## Ejecución en Producción

### Build del Instalador

```powershell
# Desde la raíz del proyecto
cd apps/desktop

# Build completo (frontend + backend + electron + instalador)
npm run build

# O paso a paso:
npm run build:frontend
npm run build:backend
npm run build:electron
node scripts/copy-deps.js
npm run package
```

**Resultado**: `apps/desktop/release/NexoPOS-Setup-1.0.4.exe`

### Distribución

#### Para el Usuario Final

1. **Instalar PostgreSQL** (si no está instalado)
2. **Crear base de datos** `nexopos`
3. **Ejecutar `NexoPOS-Setup-1.0.4.exe`**
4. **Setup Wizard** se abrirá automáticamente en el primer inicio
5. Ingresar credenciales de PostgreSQL
6. El sistema corre las migraciones automáticamente
7. Listo para usar

#### Setup Wizard - Primera Ejecución

El Setup Wizard solicita:
- ✅ Host de PostgreSQL (default: localhost)
- ✅ Puerto (default: 5432)
- ✅ Nombre de base de datos (default: nexopos)
- ✅ Usuario de PostgreSQL
- ✅ Contraseña de PostgreSQL

Guarda la configuración en `%APPDATA%\@sistema\desktop\.env`

---

## Troubleshooting

### Problemas Comunes

#### 1. Error: "Cannot find module"

**Síntoma**: Al ejecutar el instalador aparece "Cannot find module 'XXX'"

**Causa**: Falta una dependencia en el build

**Solución**:
```powershell
cd apps/desktop
node scripts/copy-backend-deps.js
# Copiar salida a electron-builder.yml
npm run package
```

Ver [DEPENDENCIAS-INSTALADOR.md](./DEPENDENCIAS-INSTALADOR.md) para más detalles.

#### 2. Error: "ECONNREFUSED" al conectar a PostgreSQL

**Síntoma**: Backend no puede conectar a la base de datos

**Causa**: PostgreSQL no está corriendo o credenciales incorrectas

**Solución**:
```powershell
# Verificar que PostgreSQL esté corriendo
Get-Service postgresql*

# Si no está corriendo, iniciarlo
Start-Service postgresql-x64-15  # (ajustar versión)

# Verificar conexión manualmente
psql -U postgres -d nexopos
```

#### 3. Error: "Port 3000 is already in use"

**Síntoma**: Backend no inicia porque el puerto está ocupado

**Causa**: Otro proceso está usando el puerto 3000

**Solución**:
```powershell
# Ver qué proceso usa el puerto
netstat -ano | findstr :3000

# Matar el proceso (reemplazar PID)
taskkill /F /PID [PID]

# O cambiar el puerto en .env
BACKEND_PORT=3001
```

#### 4. Error en migraciones

**Síntoma**: "Migration XXXX has already been executed"

**Causa**: Las migraciones no están sincronizadas

**Solución**:
```powershell
# Ver estado de migraciones
npm run migration:show --workspace=@sistema/backend

# Revertir última migración
npm run migration:revert --workspace=@sistema/backend

# O regenerar base de datos (CUIDADO: borra datos)
# DROP DATABASE nexopos;
# CREATE DATABASE nexopos;
npm run migration:run --workspace=@sistema/backend
```

#### 5. Instalador no inicia

**Síntoma**: Al hacer doble clic en el .exe no pasa nada

**Causa**: Windows Defender o antivirus bloqueando

**Solución**:
1. Agregar excepción en Windows Defender
2. Firmar el ejecutable con certificado de código (para producción)
3. Verificar logs en `%APPDATA%\@sistema\desktop\logs\main.log`

#### 6. Pantalla blanca en Electron

**Síntoma**: La ventana de Electron se abre pero queda en blanco

**Causa**: Frontend no se cargó correctamente

**Solución**:
```powershell
# Desarrollo: verificar que frontend esté corriendo
curl http://localhost:5173

# Producción: verificar que dist/ exista
ls apps\desktop\dist\renderer\index.html

# Abrir DevTools para ver errores (presionar F12 en la app)
```

---

## Logs y Debugging

### Ubicación de Logs

#### Desarrollo
```
apps/desktop/logs/main.log
```

#### Producción
```
C:\Users\[usuario]\AppData\Roaming\@sistema\desktop\logs\main.log
```

### Ver Logs en Tiempo Real

```powershell
# Windows PowerShell
Get-Content "$env:APPDATA\@sistema\desktop\logs\main.log" -Wait -Tail 50

# O con herramienta externa
notepad "$env:APPDATA\@sistema\desktop\logs\main.log"
```

### Habilitar DevTools en Producción

Agregar en `.env`:
```env
DEBUG_TOOLS=true
```

Reiniciar la aplicación y presionar `F12` para abrir Chrome DevTools.

---

## Checklist de Instalación

### Para Desarrollo

- [ ] Node.js 18.x o 20.x instalado
- [ ] PostgreSQL 14.x+ instalado y corriendo
- [ ] Git instalado
- [ ] Repositorio clonado
- [ ] `npm install` ejecutado sin errores
- [ ] Archivo `.env` creado y configurado
- [ ] Base de datos `nexopos` creada
- [ ] Migraciones ejecutadas (`npm run migration:run`)
- [ ] `npm run dev` funciona correctamente

### Para Producción (Usuario Final)

- [ ] PostgreSQL 14.x+ instalado y corriendo
- [ ] Base de datos `nexopos` creada
- [ ] Instalador `NexoPOS-Setup-1.0.4.exe` descargado
- [ ] Instalador ejecutado exitosamente
- [ ] Setup Wizard completado
- [ ] Aplicación inicia sin errores
- [ ] Login funciona correctamente

> **Nota**: Node.js NO necesita ser instalado - está incluido en el instalador.

---

## Versiones Compatibles

| Componente | Versión Mínima | Versión Recomendada | Versión Máxima Probada |
|------------|----------------|---------------------|------------------------|
| Node.js | 18.0.0 | 20.x (LTS) | 25.2.0 |
| npm | 9.0.0 | 10.x | 10.x |
| PostgreSQL | 14.0 | 15.x | 16.x |
| Windows | 10 (1809) | 11 | 11 |
| TypeScript | 5.3.0 | 5.3.3 | 5.4.x |
| Electron | 30.0.0 | 30.0.0 | 30.x |

---

## Soporte y Contacto

**Desarrollador**: Agustín Albonico  
**Repositorio**: [github.com/AgustinAlbonico/sistema-gestion](https://github.com/AgustinAlbonico/sistema-gestion)  
**Documentación**: `docs/`

**Documentos Relacionados**:
- [DEPENDENCIAS-INSTALADOR.md](./DEPENDENCIAS-INSTALADOR.md) - Dependencias del instalador
- [tecnica/guia-instalacion.md](./tecnica/guia-instalacion.md) - Guía de instalación detallada
- [tecnica/guia-certificados-arca.md](./tecnica/guia-certificados-arca.md) - Certificados AFIP
- [planificacion-nexopos.md](./planificacion-nexopos.md) - Planificación del proyecto

---

**Última actualización**: 22 de diciembre de 2024  
**Versión del documento**: 1.0  
**Versión de NexoPOS**: 1.0.4

