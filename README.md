# UTT Tehuacán — control de asistencia para congresos

Sistema de control de asistencia para congresos de la Universidad Tecnológica de Tehuacán. Su modelo de datos admite múltiples eventos, actividades y talleres.

La aplicación utiliza React, Next.js y PostgreSQL en Docker.

## Estado del proyecto

Versión funcional preparada para despliegue. Incluye administración de alumnos, credenciales QR/NFC, registro de asistencias, control de duplicados, talleres, correo y permisos por rol.

## Incluido

- Inicio de sesión con cookie segura.
- Roles super_admin, event_admin, scanner y viewer.
- Panel de métricas, alumnos, usuarios y asistencias.
- Escáner QR desde la cámara en navegadores compatibles.
- Captura manual como respaldo del escaneo QR/NFC.
- Prevención de duplicados mediante restricción única por alumno y sesión.
- Bitácora independiente de todos los intentos de lectura.
- Tokens de gafete almacenados como SHA-256, no como texto visible.
- Alta individual con generación automática de credencial.
- Vista previa imprimible, reemisión, escritura y verificación Web NFC.
- Edición completa de alumnos sin fotografía, búsqueda y filtros.
- Importación y exportación CSV compatible con Excel y Google Sheets.
- CRUD de congresos y sesiones con un único congreso activo a la vez.
- Protección contra el borrado de congresos o sesiones con información asociada.
- Asignación de alumnos y personal por congreso.
- Importación CSV dirigida al congreso seleccionado.
- Acceso al escáner limitado al personal asignado.
- CRUD de usuarios con roles, activación, eliminación segura y restablecimiento de contraseña.
- Invalidación inmediata de sesiones pertenecientes a usuarios desactivados o eliminados.
- Registro de asistencias por NFC, QR o captura manual.
- Credenciales reutilizables o limitadas por número de actividades.
- Talleres con clave, cupo, inscripción previa y consumo configurable de credencial.
- Asignación de alumnos desde el taller o desde su expediente.
- Confirmación móvil con nombre, matrícula, programa, actividad y usos restantes.
- Cola de credenciales por correo con cifrado AES-256-GCM, reintentos y seguimiento de estado.
- Integración preparada exclusivamente para Resend, sin claves almacenadas en el repositorio.
- Formularios administrativos en modales responsivos y acciones de usuarios mediante iconos accesibles.

## Roles y permisos

Al crear o editar un integrante, el rol aplica inmediatamente sus funciones y lo vincula de forma automática con los congresos existentes. Los congresos nuevos incorporan automáticamente a los usuarios activos.

| Función | Superadministración | Administración de evento | Registro | Consulta |
|---|:---:|:---:|:---:|:---:|
| Panel general | Sí | Sí | Sí | Sí |
| Crear y administrar congresos asignados | Sí | Sí | No | No |
| Administrar sesiones y alumnos | Sí | Sí | No | No |
| Generar credenciales QR/NFC | Sí | Sí | No | No |
| Escanear QR/NFC y registrar asistencias | Sí | Sí | Sí, en congresos asignados | No |
| Consultar alumnos y asistencias | Sí | Sí | No | Sí, sólo lectura |
| Administrar usuarios y asignaciones | Sí | No | No | No |

Los permisos se validan nuevamente en la API. Ocultar una opción del menú no concede ni revoca acceso por sí mismo. El usuario de **Registro** necesita estar asignado al congreso activo para recibir sus sesiones en el escáner.

## Uso de NFC

Web NFC funciona desde Chrome en Android, con NFC encendido y el sistema abierto mediante HTTPS. En la credencial recién generada se utiliza **Configurar chip NFC** para escribir el token y **Verificar chip** para confirmar que corresponde al alumno. En el módulo **Escanear** se selecciona una sesión y se activa **Iniciar lector NFC** para registrar varios gafetes consecutivamente.

Los chips deben aceptar mensajes NDEF y permanecer desbloqueados durante las pruebas. El QR y la captura manual siguen disponibles como respaldo. Safari en iPhone no ofrece esta misma API web, por lo que una fase posterior puede requerir una aplicación nativa.

### Primer ensayo físico local

La opción recomendada para probar sin publicar el sistema en Internet es conectar un teléfono Android por USB y utilizar la redirección de puertos de ADB. Se necesita:

- Teléfono Android con NFC y Chrome actualizado.
- Un chip regrabable compatible con NDEF; NTAG213, NTAG215 o NTAG216 son opciones habituales.
- Cable USB de datos.
- Depuración USB activada en las opciones de desarrollador del teléfono.
- Android SDK Platform Tools (`adb`) instalado en la computadora.
- Pantalla del teléfono desbloqueada, NFC encendido y Chrome visible durante la lectura.

Con PostgreSQL y la aplicación iniciados, conectar y autorizar el teléfono, y ejecutar:

~~~powershell
adb devices
adb reverse tcp:3000 tcp:3000
~~~

Después, abrir `http://localhost:3000` en **Chrome del teléfono**. Esta dirección llega a la aplicación de la computadora mediante USB y evita utilizar la IP local por HTTP, que Web NFC rechaza por no ser un contexto seguro.

Secuencia del ensayo:

1. Iniciar sesión con el superadministrador configurado en Docker.
2. Abrir **Alumnos**, seleccionar uno y generar o reemitir su credencial.
3. Pulsar **Configurar chip NFC**, aceptar el permiso y acercar un solo chip.
4. Pulsar **Verificar chip** y acercar el mismo chip.
5. Ir a **Escanear**, seleccionar la sesión y pulsar **Iniciar lector NFC**.
6. Acercar el chip una vez: debe registrar la asistencia.
7. Acercarlo nuevamente: debe mostrarse como duplicado sin crear otra asistencia.
8. Confirmar ambos intentos en la bitácora de asistencias.

No bloquear permanentemente el chip durante el piloto. Si `adb devices` muestra `unauthorized`, desbloquear el teléfono y aceptar la huella RSA. Al terminar se puede retirar la redirección con `adb reverse --remove tcp:3000`.

## Importar alumnos

Desde **Alumnos → Importar CSV** se puede cargar un máximo de 5,000 filas o 2 MB por archivo. Las columnas requeridas son `Matrícula`, `Nombre` y `Programa`; `Correo`, `Talleres`, `TipoCredencial` y `Usos` son opcionales. También se aceptan sus equivalentes en inglés.

En `Talleres` se utilizan las claves configuradas en el congreso, separadas con `|`. `TipoCredencial` acepta `reutilizable` o `limitada`; cuando es limitada, `Usos` debe contener un entero entre 1 y 1,000. Una importación agrega las inscripciones indicadas sin retirar talleres anteriores y se revierte completa si contiene una clave inexistente, un cupo insuficiente o datos inválidos.

Si una matrícula ya existe, sus datos se actualizan y el alumno se reactiva. Si no existe, se crea y queda listo para generar su credencial. Desde el detalle de un congreso, la importación asigna todas las filas directamente a ese evento. La plantilla está disponible en `public/plantilla-alumnos.csv` y desde la propia pantalla de importación.

## Requisitos

- Node.js 20 o posterior.
- Docker Desktop.
- Git.

## Arranque

~~~powershell
npm install
Copy-Item .env.example .env
Copy-Item .env.example .env.local
# Editar ambos archivos y reemplazar todos los valores de ejemplo.
docker compose up -d postgres
npm run dev
~~~

Abrir http://localhost:3000.

PostgreSQL queda disponible en el puerto local 5433. La aplicación toma la configuración de .env.local.

Si el proyecto ya utilizaba un volumen de PostgreSQL anterior, aplicar las migraciones pendientes:

~~~powershell
Get-Content database/migrations/003_nfc_status.sql | docker exec -i congreso_nfc_db psql -U congreso -d congreso_nfc
Get-Content database/migrations/004_default_event_access.sql | docker exec -i congreso_nfc_db psql -U congreso -d congreso_nfc
Get-Content database/migrations/005_workshops_and_credential_limits.sql | docker exec -i congreso_nfc_db psql -U congreso -d congreso_nfc
Get-Content database/migrations/006_credential_email_queue.sql | docker exec -i congreso_nfc_db psql -U congreso -d congreso_nfc
~~~

## Configuración

Docker Compose lee `.env` y Next.js lee `.env.local`. Crear ambos archivos y sustituir todas las claves de ejemplo antes del primer arranque:

~~~powershell
Copy-Item .env.example .env
Copy-Item .env.example .env.local
~~~

Las variables locales nunca deben subirse al repositorio. En una base nueva, Docker crea únicamente el usuario definido mediante `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL` y `SUPER_ADMIN_PASSWORD`. La contraseña debe tener al menos 12 caracteres, letras y números.

### Correo con Resend

La aplicación utiliza una cola propia en PostgreSQL y Resend como único proveedor. Preparar un lote no envía los mensajes inmediatamente: primero crea entregas pendientes y después el trabajador procesa una por petición. Esto permite reintentar errores sin duplicar los correos aceptados por Resend.

En el VPS se deben configurar estas variables:

| Variable | Uso |
|---|---|
| `RESEND_API_KEY` | Clave API creada en Resend. |
| `EMAIL_FROM` | Remitente verificado, por ejemplo `Credenciales UTT <credenciales@dominio.edu.mx>`. |
| `CREDENTIAL_ENCRYPTION_KEY` | Clave aleatoria de 32 bytes en base64 para cifrar los tokens recuperables. |
| `EMAIL_WORKER_KEY` | Secreto para autorizar al trabajador o tarea programada. |

Antes de habilitar los envíos se debe verificar en Resend un dominio o subdominio y publicar sus registros SPF y DKIM. Las credenciales emitidas antes de la migración 006 conservan su seguridad, pero necesitan reemitirse una vez para disponer del token cifrado que genera el QR del correo.

El panel **Alumnos → Envío masivo** permite preparar la cola y procesarla manualmente. En producción, el VPS podrá llamar periódicamente a `POST /api/credential-emails/process` enviando `x-email-worker-key` con el valor de `EMAIL_WORKER_KEY`. Cada llamada procesa como máximo una entrega, por lo que puede ejecutarse con una frecuencia controlada y sin ráfagas.

## Comandos

| Comando | Función |
|---|---|
| npm run dev | Inicia el servidor de desarrollo |
| npm run build | Genera y valida la compilación de producción |
| npm run check | Comprueba los tipos de TypeScript |
| npm test | Ejecuta las pruebas unitarias de CSV y Web NFC |
| npm run test:roles | Recorre las rutas y permisos de los cuatro roles; requiere el servidor encendido |
| npm run test:nfc | Simula payloads, lectura NDEF y errores de Web NFC sin hardware |
| npm run test:nfc:integration | Simula una lectura NFC completa contra la API local; requiere el servidor encendido |
| npm run test:access:integration | Valida talleres restringidos, límites, duplicados e importación CSV contra la API local |
| npm run test:email:integration | Valida localmente el cifrado y la creación de una entrega sin enviar un correo real |
| npm run test:e2e | Recorre en Chromium los modales principales y el centro de envíos |
| npm run db:up | Levanta PostgreSQL |
| npm run db:down | Detiene PostgreSQL |
| npm run db:logs | Muestra los registros de PostgreSQL |

## Inicializar una base limpia

En un entorno nuevo, los archivos de `database/init` crean el esquema vacío y un solo superadministrador. No incluyen congresos, alumnos, actividades, credenciales ni usuarios de prueba.

Esta operación elimina por completo el volumen local y vuelve a crear una base vacía. No debe ejecutarse sobre una base con información que se necesite conservar:

~~~powershell
docker compose down -v
docker compose up -d postgres
~~~

## Despliegue en el VPS

La configuración de producción utiliza cinco servicios aislados:

- `caddy`: único servicio público, encargado de HTTPS en los puertos 80 y 443.
- `app`: servidor Next.js sin puerto público.
- `postgres`: base de datos sin puerto público.
- `backup`: respaldo diario en formato PostgreSQL custom con retención de 14 días.
- `email-worker`: trabajador de Resend desactivado por defecto hasta verificar el dominio.

Mientras no exista un dominio institucional se puede utilizar `167-99-107-119.sslip.io`, que resuelve a la IP del VPS y permite obtener un certificado TLS público. Al adquirir el dominio sólo se cambia `APP_HOST` y se recrea Caddy.

Después de clonar el repositorio en el servidor:

~~~bash
cd /opt/utt-asistencias
cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -base64 32
nano .env.production
~~~

Los tres valores hexadecimales se utilizan, sin repetirlos, para `POSTGRES_PASSWORD`, `JWT_SECRET` y `EMAIL_WORKER_KEY`. El valor base64 se utiliza para `CREDENTIAL_ENCRYPTION_KEY`. `DATABASE_URL` debe incluir exactamente la misma contraseña hexadecimal de PostgreSQL. No se deben compartir estos valores por chat ni almacenarlos en Git.

Para levantar y revisar el sistema:

~~~bash
docker compose --env-file .env.production -f compose.production.yml up -d --build
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml logs --tail=100 app caddy postgres backup
curl -I https://167-99-107-119.sslip.io/login
~~~

El primer arranque de una base vacía crea exclusivamente el superadministrador definido en `.env.production`. Los respaldos locales se guardan en `backups/`; complementan, pero no sustituyen, los respaldos semanales del proveedor.

Cuando el dominio de Resend esté verificado, completar `RESEND_API_KEY` y `EMAIL_FROM`, y activar únicamente el trabajador de correo:

~~~bash
docker compose --env-file .env.production -f compose.production.yml --profile email up -d email-worker
~~~

Para cambiar posteriormente al dominio institucional, actualizar `APP_HOST` y `ACME_EMAIL`, comprobar que el registro DNS apunta al VPS y ejecutar:

~~~bash
docker compose --env-file .env.production -f compose.production.yml up -d --force-recreate caddy
~~~

## Arquitectura actual

~~~text
Chrome Android / NFC o cámara QR
        |
        v
Next.js (interfaz + API)
        |
        v
PostgreSQL 16 en Docker
~~~

## Estructura

~~~text
database/init/        Esquema y superadministrador inicial
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
- Siempre debe permanecer al menos un superadministrador activo.

La hoja de cálculo y Firebase quedan fuera de esta etapa. Cuando el flujo local esté aprobado, se puede agregar sincronización por lotes con Google Sheets y decidir entre:

1. Conservar PostgreSQL en producción.
2. Migrar la persistencia a Firestore.
3. Usar Firebase solamente para autenticación/notificaciones y PostgreSQL para las asistencias.

## Hoja de ruta

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

Las contraseñas, claves y configuración privada se suministran mediante variables de entorno y nunca deben incorporarse al repositorio.
