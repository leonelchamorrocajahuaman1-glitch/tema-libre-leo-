# HALVEN MOTOS — tienda de motocicletas premium

Tienda online de motocicletas deportivas y de alto rendimiento, construida sobre el hero
original **"RIDE OUT"** (carrusel WebGL de motos con fondo que cambia de color), con un
panel de administración independiente. Ambos usan la misma base de datos en **Supabase**
(PostgreSQL + Auth + Storage + Edge Functions).

- **Tienda:** `halvenmotos/index.html`
- **Panel:** `halvenmotos/admin/` (solo para roles autorizados)
- **Proyecto Supabase:** `halven-motos` (`qoqmcfkmkxtbyqfbpgby`, región São Paulo)

---

## 1. Estructura del proyecto

```
halvenmotos/
├── index.html                  Tienda (hero original + rutas por hash)
├── admin/index.html            Panel de administración
├── assets/
│   ├── css/base.css            Tokens (negro, blanco, gris metálico, amarillo) y componentes comunes
│   ├── css/store.css           Hero original (geometría intacta) + estilos de la tienda
│   ├── css/admin.css           Estilos del panel
│   └── js/
│       ├── config.js           URL y clave PÚBLICA de Supabase (sin secretos)
│       ├── core.js             Cliente Supabase, sesión, carrito, utilidades
│       ├── hero.js             Motor del carrusel "RIDE OUT" (WebGL)
│       ├── store.js            Tienda: catálogo, detalle, carrito, cuenta, checkout, pedidos
│       └── admin.js            Panel: dashboard, CRUD, pedidos, clientes, inventario, contenido
└── supabase/
    ├── config.toml             Configuración de funciones para la CLI
    ├── migrations/
    │   ├── 20261127000001_schema.sql              Tablas, tipos, índices, triggers
    │   ├── 20261127000002_logic_and_security.sql  RPC de negocio, RLS, permisos, Storage
    │   ├── 20261127000003_seed.sql                Categorías, catálogo inicial y ajustes
    │   └── 20261127000004_fk_indexes.sql          Índices de claves foráneas
    └── functions/
        ├── mp-create-preference/   Inicia el pago en Mercado Pago (importe desde la BD)
        ├── mp-webhook/             Confirma pagos consultando la API de Mercado Pago
        ├── admin-user-status/      Activa/bloquea cuentas (perfil + Supabase Auth)
        └── _shared/cors.ts
```

Las cuatro migraciones **ya están aplicadas** en el proyecto y las tres funciones **ya están desplegadas**.

---

## 2. Funcionalidades

### Tienda del cliente
- **Hero original conservado:** "RIDE OUT" detrás de la moto, fondo que cambia de color con la moto, motos laterales pequeñas y desenfocadas, flechas amarillas, arrastre, autoplay, carga escalonada y los tres tamaños de pantalla (computadora, tablet, celular). Las motos del carrusel son las **destacadas** de la base de datos.
- La ficha translúcida inferior muestra la **moto central**: nombre, precio, cilindrada, potencia, velocidad, aceleración, autonomía y refrigeración, con botones **Consultar** (WhatsApp) y **Comprar**.
- Navegación: menú lateral, carrito con contador, **Explorar motocicletas**, **Contacto**, cabecera fija al bajar.
- **Catálogo:** tarjetas con foto, nombre, marca, modelo, año, precio, cilindrada, potencia, velocidad máxima y disponibilidad; **Ver detalles** y **Comprar**. Filtros por marca, precio, cilindrada, categoría y disponibilidad; **buscador en tiempo real**; orden; **paginación en el servidor**.
- **Detalle:** galería, descripción, ficha técnica completa (motor, transmisión, frenos, tanque…), colores, stock, cantidad, **Comprar ahora**, **Agregar al carrito**, **Consultar por WhatsApp**, favoritos y motos relacionadas.
- **Carrito:** agregar, eliminar, cambiar cantidades (limitadas al stock), subtotal y total. Guarda solo ids: los precios siempre se leen de la base de datos.
- **Cuenta:** registro, inicio de sesión, recuperar contraseña, cambiar contraseña, editar datos, favoritos.
- **Checkout:** datos del cliente, entrega (envío o recojo), dirección, resumen, método de pago y confirmación con número de pedido.
- **Mis pedidos:** número, motos, fecha, precio, estado (Pendiente, Confirmado, Preparando, Enviado, Entregado) y estado del pago, con línea de tiempo. El cliente puede cancelar un pedido pendiente sin pago.
- **Notificaciones en tiempo real** de cambios de estado, **WhatsApp flotante**, páginas Nosotros, Servicios, Galería, Contacto, Preguntas frecuentes, Privacidad y Términos.

### Panel de administración (`/admin`)
- **Dashboard** con datos reales: total de motos, disponibles, agotadas, clientes, pedidos, ventas del día y del mes, ingresos totales; gráficos de ventas por mes, evolución de ingresos, productos más vendidos y pedidos por estado; alertas de configuración y de stock.
- **Motocicletas (CRUD):** crear, editar, eliminar, subir fotos a Storage (arrastrar y soltar, ordenar), precios, descripciones, ficha técnica, colores, stock, destacadas, publicar/ocultar e imagen del hero. Los cambios se ven al instante en la tienda.
- **Categorías:** crear, editar y eliminar (Deportivas, Naked, Touring, Urbanas, Adventure y Enduro ya creadas).
- **Pedidos:** lista con filtros, detalle con cliente, motos, importes, pagos e historial; avanzar estado, confirmar, cancelar (devuelve el stock), registrar pagos manuales y notas internas. Aviso en vivo de pedidos nuevos.
- **Clientes:** nombre, correo, teléfono, fecha de registro, cantidad de pedidos, total comprado y estado; ver ficha, cambiar rol y activar/bloquear la cuenta.
- **Inventario:** stock, unidades reservadas y vendidas, estado y alertas de stock bajo editables.
- **Contenido:** palabra y botón del hero, motos destacadas y su orden, textos de inicio, servicios, preguntas frecuentes, galería, contacto y redes sociales.
- **Configuración:** datos de la tienda (razón social, RUC, logotipo), moneda PEN (S/), métodos de pago e instrucciones, costo de envío y textos legales.

### Roles
| Rol | Acceso |
|---|---|
| `customer` | Solo la tienda |
| `admin` | Todo el panel |
| `sales` | Dashboard, pedidos, pagos, clientes, inventario (lectura) |
| `catalog` | Motos, categorías, inventario, fotos y contenido |

---

## 3. Base de datos (Supabase)

| Tabla | Para qué sirve |
|---|---|
| `profiles` | Datos del cliente y su rol (se crea solo al registrarse; el rol nace como `customer`) |
| `categories` | Categorías del catálogo |
| `motorcycles` | Motos: precio, ficha técnica, colores, imagen del hero, publicada/destacada |
| `motorcycle_images` | Fotos de cada moto (Storage) |
| `inventory` | Stock y umbral de alerta por moto |
| `orders` | Pedidos con datos de cliente, entrega, importes, estado y estado de pago |
| `order_items` | Líneas del pedido con nombre y precio **congelados** al comprar |
| `order_status_history` | Historial de estados (lo ve el cliente) |
| `payments` | Pagos por pedido (Mercado Pago o manual) |
| `site_settings` | Contenido y configuración editables desde el panel |
| `favorites` | Favoritos de cada cliente |
| `notifications` | Avisos de pedidos para clientes y equipo (tiempo real) |

**Seguridad aplicada en la base de datos (no solo en la interfaz):**
- RLS activado en todas las tablas; los permisos de tabla además se restringen por columna (un cliente solo puede editar su nombre, teléfono, documento y dirección; **nunca** su rol).
- Los pedidos solo se crean con la función `create_order`, que toma precios y stock **de la base de datos**, bloquea el stock (`FOR UPDATE`), valida datos y métodos de pago habilitados, y descuenta el inventario.
- Estados y pagos solo cambian con funciones que verifican el rol (`admin_update_order_status`, `admin_register_payment`). Los pagos de Mercado Pago solo los aplica `apply_gateway_payment`, ejecutable únicamente por la Edge Function con `service_role`, después de consultar el pago en la API de Mercado Pago y comparar el importe.
- Storage: lectura pública de fotos; subir, cambiar o borrar solo `admin`/`catalog`.
- Las contraseñas las gestiona Supabase Auth (nunca se guardan en tablas propias).

---

## 4. Variables y secretos

### Frontend (`assets/js/config.js`) — ya configurado
| Variable | Valor | ¿Secreto? |
|---|---|---|
| `SUPABASE_URL` | `https://qoqmcfkmkxtbyqfbpgby.supabase.co` | No |
| `SUPABASE_KEY` | clave *publishable* (`sb_publishable_…`) | No, es pública por diseño |

> Nunca pongas la clave `service_role` ni el token de Mercado Pago en el frontend.

### Edge Functions — **debes configurarlos tú** (Supabase → Edge Functions → Secrets)
| Secreto | Para qué | Obligatorio |
|---|---|---|
| `MP_ACCESS_TOKEN` | Access token de Mercado Pago (Perú). Usa primero uno de **prueba** | Para cobrar con Mercado Pago |
| `SITE_URL` | URL pública de la tienda, p. ej. `https://tudominio.com/` | Para cobrar con Mercado Pago |
| `MP_WEBHOOK_SECRET` | "Clave secreta" de Webhooks de tu panel de Mercado Pago | Recomendado |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase automáticamente.

En Mercado Pago (Tus integraciones → Webhooks) registra la URL
`https://qoqmcfkmkxtbyqfbpgby.supabase.co/functions/v1/mp-webhook` con el evento **Pagos**.
Luego activa Mercado Pago en **Panel → Configuración → Métodos de pago**.
Mientras no esté configurado, el método aparece desactivado y ningún pago se aprueba.

### Supabase Auth — configúralo antes de publicar
1. **Authentication → URL Configuration:** pon tu dominio en *Site URL* y agrégalo en *Redirect URLs* (p. ej. `https://tudominio.com/**`). Lo usan los correos de confirmación y de recuperación de contraseña.
2. **Authentication → SMTP Settings:** configura un SMTP propio (Resend, SendGrid, Brevo…). El SMTP incluido en Supabase tiene un límite muy bajo de correos por hora y no sirve para producción.
3. Recomendado: contraseña mínima de 8 caracteres en *Authentication → Providers → Email*.

---

## 5. Crear el primer administrador

1. Abre la tienda, ve a **Crear cuenta** y regístrate con tu correo. Confirma el correo.
2. En Supabase, abre **SQL Editor** y ejecuta (con tu correo):
   ```sql
   update public.profiles set role = 'admin' where email = 'tu-correo@dominio.com';
   ```
3. Entra a `/admin/` con ese correo y contraseña.

Desde ese momento puedes asignar roles a otras personas en **Panel → Clientes** (el cambio de rol
solo lo puede hacer un administrador, y nadie puede cambiarse su propio rol).

---

## 6. Ejecutar y desplegar

### En tu computadora
Los módulos JavaScript necesitan un servidor (no funciona abriendo el archivo con doble clic):
```bash
cd halvenmotos
python3 -m http.server 8080
```
Abre `http://localhost:8080` (tienda) y `http://localhost:8080/admin/` (panel).

### Publicar
Es un sitio estático: publica la carpeta `halvenmotos/` en cualquier hosting estático
(Hostinger, Netlify, Vercel, Cloudflare Pages o GitHub Pages). No requiere build.
Después:
1. Actualiza *Site URL* y *Redirect URLs* en Supabase Auth con tu dominio.
2. Configura `SITE_URL` (y los secretos de Mercado Pago) en Edge Functions.
3. Revisa en el panel: WhatsApp y contacto (Contenido), datos bancarios, RUC y textos legales (Configuración), precios y stock de las motos.

### Volver a desplegar la base de datos o las funciones (CLI, opcional)
```bash
supabase link --project-ref qoqmcfkmkxtbyqfbpgby
```
```bash
supabase db push
```
```bash
supabase functions deploy mp-create-preference mp-webhook admin-user-status
```

---

## 7. Datos iniciales

- Las 6 categorías y las **4 ediciones Halven RS-V4** del hero original (con la lámina de imágenes original) se cargaron como catálogo inicial, con precios, fichas y stock **de arranque**. **Revísalos o reemplázalos** desde el panel con tu inventario real antes de abrir la tienda.
- No hay pedidos, pagos ni clientes: todo eso se crea con el uso real.
- Para nuevas motos en el carrusel del hero, sube un **PNG transparente de perfil lateral mirando a la derecha** en la pestaña "Hero y publicación". Las fotos normales del catálogo pueden ser JPG con fondo.

---

## 8. Pruebas realizadas (contra la base real)

- **Seguridad por API (27 comprobaciones):** el cliente no puede cambiar su rol, precios, stock, estados ni pagos, ni insertar pedidos directamente, ni usar funciones de administración o la del webhook, ni subir archivos. Un pedido enviado con precio manipulado se cobra con el precio real, y el stock se descuenta.
- **Tienda (navegador):** carrito, cantidades, checkout que exige iniciar sesión, error con contraseña incorrecta, validaciones, pedido creado con número, carrito vaciado, Mis pedidos, cancelación (el stock vuelve), favoritos, edición de perfil, buscador y filtros, y el bloqueo de `/admin` para clientes.
- **Panel (navegador):** dashboard, crear categoría, crear moto con slug automático, subida de foto a Storage visible en la tienda, ocultar/publicar, editar precio, alerta de stock bajo, cambio de estado reflejado en la cuenta del cliente, pagos manuales, desactivar una cuenta (el usuario queda bloqueado en Auth) y reactivarla, y WhatsApp configurable.
- **Móvil:** 320×568, 390×844 y 768×1024 sin desbordes horizontales.
- Los usuarios, pedidos y archivos de prueba se **eliminaron** al terminar.

**No probado:** el envío real de correos (registro y recuperación) para no enviar correos a direcciones
inventadas, y el cobro real con Mercado Pago, que necesita tu token. Haz una compra de prueba con un
token de **prueba** de Mercado Pago antes de usar el de producción.
