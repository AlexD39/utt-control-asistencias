# UTT Tehuacán — control de asistencia para congresos

Sistema de control de asistencia para el congreso de la Universidad Tecnológica de Tehuacán. El proyecto comienza con un único congreso activo, pero su modelo de datos admite múltiples eventos y sesiones.

La aplicación se desarrolla primero de manera local con React, Next.js y PostgreSQL en Docker. Esta etapa no consume recursos de Firebase.

## Estado del proyecto

En desarrollo activo. Actualmente incluye administración de alumnos, credenciales QR, registro de asistencias, control de duplicados y permisos por rol. La lectura NFC móvil y el despliegue en producción están en la hoja de ruta.

## Incluido

- Inicio de sesión con cookie segura.
- Roles super_admin, event_admin, scanner y viewer.
- Panel de métricas, alumnos, usuarios y asistencias.
- Escáner QR desde la cámara en navegadores compatibles.
- Captura manual para desarrollo sin gafetes físicos.
- Prevención de duplicados mediante restricción única por alumno y sesión.
- Bitácora independiente de todos los intentos de lectura.
- Tokens de gafete almacenados como SHA-256, no como texto visible.
- Seis alumnos, tres sesiones y cuatro usuarios simulados.
- Alta individual con generación automática de credencial.
- Vista previa imprimible, reemisión y escritura Web NFC.
- Edición completa de alumnos sin fotografía, búsqueda y filtros.
- Importación y exportación CSV compatible con Excel y Google Sheets.
- CRUD de congresos y sesiones con un único congreso activo a la vez.
- Protección contra el borrado de congresos o sesiones con información asociada.
- Asignación de alumnos y personal por congreso.
- Importación CSV dirigida al congreso seleccionado.
- Acceso al escáner limitado al personal asignado.

## Importar alumnos

Desde **Alumnos → Importar CSV** se puede cargar un máximo de 5,000 filas o 2 MB por archivo. Las columnas requeridas son `Matrícula`, `Nombre` y `Programa`; `Correo` es opcional. También se aceptan sus equivalentes en inglés: `enrollment`, `name`, `program` y `email`.

Si una matrícula ya existe, sus datos se actualizan y el alumno se reactiva. Si no existe, se crea y queda listo para generar su credencial. Desde el detalle de un congreso, la importación asigna todas las filas directamente a ese evento. La plantilla está disponible en `public/plantilla-alumnos.csv` y desde la propia pantalla de importación.

## Requisitos

- Node.js 20 o posterior.
- Docker Desktop.
- Git.

## Arranque

~~~powershell
npm install
docker compose up -d postgres
npm run dev
~~~

Abrir http://localhost:3000.

PostgreSQL queda disponible en el puerto local 5433. La aplicación toma la configuración de .env.local.

## Configuración

Copiar el archivo de ejemplo si no existe una configuración local:

~~~powershell
Copy-Item .env.example .env.local
~~~

Las variables locales nunca deben subirse al repositorio. Para producción se deben reemplazar la contraseña de PostgreSQL y la clave JWT.

## Comandos

| Comando | Función |
|---|---|
| npm run dev | Inicia el servidor de desarrollo |
| npm run build | Genera y valida la compilación de producción |
| npm run check | Comprueba los tipos de TypeScript |
| npm run db:up | Levanta PostgreSQL |
| npm run db:down | Detiene PostgreSQL |
| npm run db:logs | Muestra los registros de PostgreSQL |

## Usuarios de demostración

| Rol | Correo | Contraseña |
|---|---|---|
| Superadministración | admin@congreso.local | Admin123! |
| Administración | coordinador@congreso.local | Admin123! |
| Registro | registro@congreso.local | Registro123! |
| Consulta | consulta@congreso.local | Consulta123! |

## Gafetes simulados

- DEMO-ANA-7K2P
- DEMO-DIEGO-8M4Q
- DEMO-FER-2N9R
- DEMO-JORGE-5T1X
- DEMO-VALE-4C6W
- DEMO-EMI-3B8Z

Capturar dos veces el mismo código en la misma sesión demuestra el control de duplicados. El primer intento crea la asistencia; el segundo únicamente entra en la bitácora.

## Reiniciar los datos simulados

Esta operación elimina el volumen local y vuelve a ejecutar los archivos de database/init.

~~~powershell
docker compose down -v
docker compose up -d postgres
~~~

## Arquitectura actual

~~~text
Navegador / cámara QR
        |
        v
Next.js (interfaz + API)
        |
        v
PostgreSQL 16 en Docker
~~~

## Estructura

~~~text
database/init/        Esquema y datos simulados
public/               Logotipo y recursos públicos
src/app/              Páginas y API de Next.js
src/components/       Componentes de la interfaz
src/lib/              Autenticación, PostgreSQL y utilidades
~~~

## Criterios de seguridad

- Los chips y códigos QR contienen un token aleatorio, nunca datos personales.
- Los tokens se almacenan como hash SHA-256.
- Una restricción única impide duplicar una asistencia por alumno y sesión.
- Cada intento de lectura queda registrado para auditoría.
- Los permisos se validan en el servidor, no solamente en la interfaz.

La hoja de cálculo y Firebase quedan fuera de esta etapa. Cuando el flujo local esté aprobado, se puede agregar sincronización por lotes con Google Sheets y decidir entre:

1. Conservar PostgreSQL en producción.
2. Migrar la persistencia a Firestore.
3. Usar Firebase solamente para autenticación/notificaciones y PostgreSQL para las asistencias.

## Hoja de ruta

- Administración completa de usuarios.
- Aplicación React Native para NFC en Android/iPhone.
- Cola sin conexión y sincronización.
- Integración por lotes con Google Sheets.
- Pruebas de carga, respaldos y despliegue.

## Trabajo con Git

Crear una rama para cada bloque de trabajo:

~~~powershell
git switch -c feature/nombre-del-modulo
git add .
git commit -m "feat: descripción breve del cambio"
~~~

No deben versionarse .env.local, node_modules, .next ni respaldos de la base de datos.

## Licencia y uso

Proyecto interno de la Universidad Tecnológica de Tehuacán. El logotipo institucional conserva los derechos y lineamientos de la universidad.

Las contraseñas y la clave JWT incluidas son exclusivamente para desarrollo local.
