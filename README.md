# UTT Tehuacán — control de asistencia para congresos

MVP local para registrar asistencias mediante QR y, posteriormente, NFC. El panel utiliza Next.js/React y PostgreSQL se ejecuta en Docker. Esta etapa no consume recursos de Firebase.

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
- Exportación CSV compatible con Excel y Google Sheets.

## Requisitos

- Node.js 20 o posterior.
- Docker Desktop.

## Arranque

~~~powershell
npm install
docker compose up -d postgres
npm run dev
~~~

Abrir http://localhost:3000.

PostgreSQL queda disponible en el puerto local 5433. La aplicación toma la configuración de .env.local.

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

La hoja de cálculo y Firebase quedan fuera de esta etapa. Cuando el flujo local esté aprobado, se puede agregar sincronización por lotes con Google Sheets y decidir entre:

1. Conservar PostgreSQL en producción.
2. Migrar la persistencia a Firestore.
3. Usar Firebase solamente para autenticación/notificaciones y PostgreSQL para las asistencias.

## Próximos módulos

- CRUD real de eventos, sesiones, usuarios y alumnos.
- Importación de alumnos desde CSV/XLSX.
- Generación e impresión de códigos QR.
- Aplicación React Native para NFC en Android/iPhone.
- Cola sin conexión y sincronización.
- Integración por lotes con Google Sheets.
- Pruebas de carga, respaldos y despliegue.

Las contraseñas y la clave JWT incluidas son exclusivamente para desarrollo local.
