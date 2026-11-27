-- =====================================================================
-- HALVEN MOTOS — esquema principal
-- Tablas, tipos, índices, funciones de rol y triggers.
-- =====================================================================

-- ---------- tipos ----------
create type public.app_role as enum ('customer', 'admin', 'sales', 'catalog');
-- customer: cliente de la tienda
-- admin:    acceso total al panel
-- sales:    pedidos, pagos y clientes (solo lectura de catálogo)
-- catalog:  motocicletas, categorías, inventario, imágenes y contenido

create type public.order_status as enum
  ('pendiente', 'confirmado', 'preparando', 'enviado', 'entregado', 'cancelado');

create type public.payment_status as enum
  ('pendiente', 'en_proceso', 'aprobado', 'rechazado', 'reembolsado', 'cancelado');

-- ---------- utilidades ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- profiles ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  phone       text check (phone is null or phone ~ '^[0-9+ ()-]{6,20}$'),
  document_id text check (document_id is null or document_id ~ '^[0-9A-Za-z-]{6,15}$'),
  address     text check (address is null or char_length(address) <= 200),
  city        text check (city is null or char_length(city) <= 80),
  region      text check (region is null or char_length(region) <= 80),
  role        public.app_role not null default 'customer',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
create index profiles_created_idx on public.profiles (created_at desc);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Perfil automático al registrarse (Supabase Auth). El rol SIEMPRE nace como customer.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := nullif(trim(new.raw_user_meta_data ->> 'phone'), '');
begin
  if v_phone is not null and v_phone !~ '^[0-9+ ()-]{6,20}$' then v_phone := null; end if;
  insert into public.profiles (id, email, full_name, phone)
  values (new.id, coalesce(new.email, ''),
          left(coalesce(trim(new.raw_user_meta_data ->> 'full_name'), ''), 120),
          v_phone);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_email after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------- funciones de rol (usadas por RLS y RPC) ----------
create or replace function public.has_role(variadic roles public.app_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role = any (roles)
  );
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role <> 'customer'
  );
$$;

-- ---------- categories ----------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 2 and 60),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (description is null or char_length(description) <= 400),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- motorcycles ----------
create table public.motorcycles (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name              text not null check (char_length(name) between 2 and 120),
  brand             text not null check (char_length(brand) between 1 and 60),
  model             text not null check (char_length(model) between 1 and 80),
  year              int  not null check (year between 1950 and 2100),
  category_id       uuid references public.categories (id) on delete set null,
  price             numeric(12, 2) not null check (price > 0),
  compare_at_price  numeric(12, 2) check (compare_at_price is null or compare_at_price > 0),
  displacement_cc   int check (displacement_cc is null or displacement_cc between 50 and 3000),
  power_hp          numeric(6, 1) check (power_hp is null or power_hp between 1 and 500),
  top_speed_kmh     int check (top_speed_kmh is null or top_speed_kmh between 20 and 450),
  acceleration_s    numeric(4, 1) check (acceleration_s is null or acceleration_s between 1 and 30),
  engine_type       text check (engine_type is null or char_length(engine_type) <= 120),
  transmission      text check (transmission is null or char_length(transmission) <= 120),
  brakes            text check (brakes is null or char_length(brakes) <= 200),
  tank_l            numeric(5, 1) check (tank_l is null or tank_l between 1 and 60),
  range_km          int check (range_km is null or range_km between 10 and 2000),
  weight_kg         int check (weight_kg is null or weight_kg between 40 and 600),
  cooling           text check (cooling is null or char_length(cooling) <= 60),
  seats             int check (seats is null or seats between 1 and 3),
  short_description text check (short_description is null or char_length(short_description) <= 240),
  description       text check (description is null or char_length(description) <= 6000),
  colors            jsonb not null default '[]'::jsonb check (jsonb_typeof(colors) = 'array'),
  hero_image        text,   -- PNG transparente de perfil lateral (o 'sheet:N' para la lámina original)
  hero_color        text check (hero_color is null or hero_color ~ '^#[0-9a-fA-F]{6}$'),
  is_featured       boolean not null default false,
  is_published      boolean not null default false,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index motorcycles_category_idx on public.motorcycles (category_id);
create index motorcycles_brand_idx on public.motorcycles (brand);
create index motorcycles_price_idx on public.motorcycles (price);
create index motorcycles_pub_feat_idx on public.motorcycles (is_published, is_featured, sort_order);
create trigger motorcycles_touch before update on public.motorcycles
  for each row execute function public.touch_updated_at();

-- ---------- motorcycle_images ----------
create table public.motorcycle_images (
  id            uuid primary key default gen_random_uuid(),
  motorcycle_id uuid not null references public.motorcycles (id) on delete cascade,
  url           text not null check (char_length(url) <= 1000),
  storage_path  text,
  alt           text check (alt is null or char_length(alt) <= 160),
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);
create index motorcycle_images_moto_idx on public.motorcycle_images (motorcycle_id, sort_order);

-- ---------- inventory ----------
create table public.inventory (
  motorcycle_id       uuid primary key references public.motorcycles (id) on delete cascade,
  stock               int not null default 0 check (stock >= 0),
  low_stock_threshold int not null default 2 check (low_stock_threshold >= 0),
  updated_at          timestamptz not null default now()
);
create trigger inventory_touch before update on public.inventory
  for each row execute function public.touch_updated_at();

create or replace function public.create_inventory_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inventory (motorcycle_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger motorcycles_inventory after insert on public.motorcycles
  for each row execute function public.create_inventory_row();

-- ---------- orders ----------
create sequence public.order_number_seq start 1001;

create table public.orders (
  id                 uuid primary key default gen_random_uuid(),
  order_number       text not null unique
                       default ('HM-' || lpad(nextval('public.order_number_seq')::text, 6, '0')),
  user_id            uuid references public.profiles (id) on delete set null,
  status             public.order_status not null default 'pendiente',
  payment_status     public.payment_status not null default 'pendiente',
  payment_method     text not null check (payment_method in ('mercadopago', 'transferencia', 'tienda')),
  delivery_method    text not null default 'envio' check (delivery_method in ('envio', 'recojo')),
  customer_name      text not null,
  customer_email     text not null,
  customer_phone     text not null,
  customer_document  text not null,
  shipping_address   text,
  shipping_city      text,
  shipping_region    text,
  shipping_reference text,
  notes              text,
  subtotal           numeric(12, 2) not null check (subtotal >= 0),
  shipping_cost      numeric(12, 2) not null default 0 check (shipping_cost >= 0),
  total              numeric(12, 2) not null check (total >= 0),
  currency           text not null default 'PEN',
  admin_notes        text,
  cancel_reason      text,
  confirmed_at       timestamptz,
  shipped_at         timestamptz,
  delivered_at       timestamptz,
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status);
create index orders_payment_status_idx on public.orders (payment_status);
create index orders_created_idx on public.orders (created_at desc);
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ---------- order_items ----------
create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  motorcycle_id uuid references public.motorcycles (id) on delete set null,
  product_name  text not null,
  product_brand text,
  color         text,
  unit_price    numeric(12, 2) not null check (unit_price >= 0),
  quantity      int not null check (quantity between 1 and 10),
  line_total    numeric(12, 2) not null check (line_total >= 0)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_moto_idx on public.order_items (motorcycle_id);

-- ---------- order_status_history ----------
create table public.order_status_history (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.orders (id) on delete cascade,
  status     public.order_status not null,
  note       text,
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

-- ---------- payments ----------
create table public.payments (
  id                     uuid primary key default gen_random_uuid(),
  order_id               uuid not null references public.orders (id) on delete cascade,
  provider               text not null check (provider in ('mercadopago', 'transferencia', 'tienda')),
  provider_payment_id    text,
  provider_preference_id text,
  status                 public.payment_status not null default 'pendiente',
  amount                 numeric(12, 2) not null check (amount >= 0),
  currency               text not null default 'PEN',
  detail                 text,
  raw                    jsonb,
  registered_by          uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index payments_order_idx on public.payments (order_id);
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- ---------- site_settings ----------
create table public.site_settings (
  key        text primary key check (key ~ '^[a-z0-9_]+$'),
  value      jsonb not null,
  is_public  boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger site_settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();

-- ---------- favorites ----------
create table public.favorites (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  motorcycle_id uuid not null references public.motorcycles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, motorcycle_id)
);
create index favorites_moto_idx on public.favorites (motorcycle_id);

-- ---------- notifications ----------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id) on delete cascade, -- null = para el equipo
  audience   text not null default 'customer' check (audience in ('customer', 'staff')),
  order_id   uuid references public.orders (id) on delete cascade,
  title      text not null,
  body       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_audience_idx on public.notifications (audience, created_at desc);

-- Notificaciones automáticas de pedidos (cubre RPC, panel y webhook de pago)
create or replace function public.notify_order_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  labels jsonb := '{"pendiente":"Pendiente","confirmado":"Confirmado","preparando":"Preparando",
                    "enviado":"Enviado","entregado":"Entregado","cancelado":"Cancelado"}';
  plabels jsonb := '{"pendiente":"Pendiente","en_proceso":"En proceso","aprobado":"Aprobado",
                     "rechazado":"Rechazado","reembolsado":"Reembolsado","cancelado":"Cancelado"}';
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, audience, order_id, title, body)
    values (null, 'staff', new.id, 'Nuevo pedido ' || new.order_number,
            new.customer_name || ' · S/ ' || to_char(new.total, 'FM999,999,990.00'));
    if new.user_id is not null then
      insert into public.notifications (user_id, audience, order_id, title, body)
      values (new.user_id, 'customer', new.id, 'Pedido ' || new.order_number || ' recibido',
              'Te avisaremos cada vez que cambie su estado.');
    end if;
  elsif tg_op = 'UPDATE' and new.user_id is not null then
    if new.status is distinct from old.status then
      insert into public.notifications (user_id, audience, order_id, title, body)
      values (new.user_id, 'customer', new.id,
              'Pedido ' || new.order_number || ': ' || (labels ->> new.status::text),
              coalesce(new.cancel_reason, 'El estado de tu pedido cambió.'));
    end if;
    if new.payment_status is distinct from old.payment_status then
      insert into public.notifications (user_id, audience, order_id, title, body)
      values (new.user_id, 'customer', new.id,
              'Pago del pedido ' || new.order_number || ': ' || (plabels ->> new.payment_status::text), null);
    end if;
  end if;
  return new;
end $$;
create trigger orders_notify after insert or update of status, payment_status on public.orders
  for each row execute function public.notify_order_change();
