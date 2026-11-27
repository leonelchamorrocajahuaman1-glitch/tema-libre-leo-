-- =====================================================================
-- HALVEN MOTOS — lógica de negocio (RPC) y seguridad (RLS + permisos)
-- Toda operación sensible (precios, stock, estados, pagos, roles) se
-- valida aquí, en el servidor. El frontend nunca envía precios.
-- =====================================================================

-- ---------- helpers internos ----------
create or replace function public._restock_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.inventory i
     set stock = i.stock + x.qty
    from (select motorcycle_id, sum(quantity)::int as qty
            from public.order_items
           where order_id = p_order_id and motorcycle_id is not null
           group by motorcycle_id) x
   where i.motorcycle_id = x.motorcycle_id;
end $$;

create or replace function public._status_rank(s public.order_status)
returns int language sql immutable set search_path = '' as $$
  select case s when 'pendiente' then 0 when 'confirmado' then 1 when 'preparando' then 2
                when 'enviado' then 3 when 'entregado' then 4 else 99 end;
$$;

-- ---------- crear pedido (cliente) ----------
create or replace function public.create_order(
  p_items jsonb, p_customer jsonb, p_payment_method text, p_delivery_method text default 'envio')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_profile  public.profiles;
  v_item     jsonb;
  v_moto     public.motorcycles;
  v_stock    int;
  v_qty      int;
  v_color    text;
  v_lines    jsonb := '[]'::jsonb;
  v_subtotal numeric(12, 2) := 0;
  v_shipping numeric(12, 2) := 0;
  v_pay      jsonb;
  v_ship     jsonb;
  v_order    public.orders;
  v_name text; v_email text; v_phone text; v_doc text;
  v_addr text; v_city text; v_region text; v_ref text; v_notes text;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión para comprar.' using errcode = '28000';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found or not v_profile.is_active then
    raise exception 'Tu cuenta no está habilitada para comprar.' using errcode = '42501';
  end if;
  if (select count(*) from public.orders
       where user_id = v_uid and status = 'pendiente' and payment_status in ('pendiente', 'rechazado')) >= 5 then
    raise exception 'Tienes demasiados pedidos pendientes de pago. Completa o cancela alguno.' using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'El carrito no es válido.' using errcode = '22023';
  end if;
  if p_delivery_method not in ('envio', 'recojo') then
    raise exception 'Método de entrega no válido.' using errcode = '22023';
  end if;
  select value into v_pay from public.site_settings where key = 'payments';
  if p_payment_method not in ('mercadopago', 'transferencia', 'tienda')
     or coalesce((v_pay -> p_payment_method ->> 'enabled')::boolean, false) is not true then
    raise exception 'Ese método de pago no está disponible.' using errcode = '22023';
  end if;

  -- datos del cliente
  v_name   := trim(coalesce(p_customer ->> 'name', ''));
  v_email  := lower(trim(coalesce(p_customer ->> 'email', '')));
  v_phone  := trim(coalesce(p_customer ->> 'phone', ''));
  v_doc    := upper(trim(coalesce(p_customer ->> 'document', '')));
  v_addr   := nullif(trim(coalesce(p_customer ->> 'address', '')), '');
  v_city   := nullif(trim(coalesce(p_customer ->> 'city', '')), '');
  v_region := nullif(trim(coalesce(p_customer ->> 'region', '')), '');
  v_ref    := nullif(trim(coalesce(p_customer ->> 'reference', '')), '');
  v_notes  := nullif(trim(coalesce(p_customer ->> 'notes', '')), '');
  if char_length(v_name) not between 3 and 120 then raise exception 'Ingresa tu nombre completo.' using errcode = '22023'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 160 then raise exception 'Correo electrónico no válido.' using errcode = '22023'; end if;
  if v_phone !~ '^[0-9+ ()-]{6,20}$' then raise exception 'Teléfono no válido.' using errcode = '22023'; end if;
  if v_doc !~ '^[0-9A-Z-]{8,15}$' then raise exception 'Documento (DNI/CE/RUC) no válido.' using errcode = '22023'; end if;
  if p_delivery_method = 'envio' then
    if v_addr is null or char_length(v_addr) not between 5 and 200 then raise exception 'Ingresa la dirección de entrega.' using errcode = '22023'; end if;
    if v_city is null or char_length(v_city) > 80 then raise exception 'Ingresa la ciudad.' using errcode = '22023'; end if;
    if v_region is null or char_length(v_region) > 80 then raise exception 'Ingresa la región.' using errcode = '22023'; end if;
  end if;
  if v_ref is not null and char_length(v_ref) > 200 then raise exception 'Referencia demasiado larga.' using errcode = '22023'; end if;
  if v_notes is not null and char_length(v_notes) > 500 then raise exception 'Notas demasiado largas.' using errcode = '22023'; end if;

  -- líneas: precio y stock salen SIEMPRE de la base de datos
  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_qty := (v_item ->> 'quantity')::int;
      select * into v_moto from public.motorcycles
       where id = (v_item ->> 'motorcycle_id')::uuid and is_published;
    exception when others then
      raise exception 'El carrito no es válido.' using errcode = '22023';
    end;
    if v_moto.id is null then
      raise exception 'Una motocicleta del carrito ya no está disponible.' using errcode = 'P0002';
    end if;
    if v_qty is null or v_qty not between 1 and 5 then
      raise exception 'Cantidad no válida para %.', v_moto.name using errcode = '22023';
    end if;
    v_color := nullif(trim(coalesce(v_item ->> 'color', '')), '');
    if v_color is not null and not exists (
         select 1 from jsonb_array_elements(v_moto.colors) c where c ->> 'name' = v_color) then
      raise exception 'El color % no está disponible para %.', v_color, v_moto.name using errcode = '22023';
    end if;

    select stock into v_stock from public.inventory where motorcycle_id = v_moto.id for update;
    if v_stock is null or v_stock < v_qty then
      raise exception 'Stock insuficiente para % (disponibles: %).', v_moto.name, coalesce(v_stock, 0) using errcode = 'P0003';
    end if;
    update public.inventory set stock = stock - v_qty where motorcycle_id = v_moto.id;

    v_subtotal := v_subtotal + v_moto.price * v_qty;
    v_lines := v_lines || jsonb_build_object(
      'motorcycle_id', v_moto.id, 'name', v_moto.name, 'brand', v_moto.brand, 'color', v_color,
      'price', v_moto.price, 'qty', v_qty);
    v_moto := null;
  end loop;

  if p_delivery_method = 'envio' then
    select value into v_ship from public.site_settings where key = 'shipping';
    v_shipping := coalesce((v_ship ->> 'envio_cost')::numeric, 0);
    if (v_ship ->> 'free_from') is not null and v_subtotal >= (v_ship ->> 'free_from')::numeric then
      v_shipping := 0;
    end if;
  end if;

  insert into public.orders (
    user_id, payment_method, delivery_method, customer_name, customer_email, customer_phone,
    customer_document, shipping_address, shipping_city, shipping_region, shipping_reference,
    notes, subtotal, shipping_cost, total)
  values (
    v_uid, p_payment_method, p_delivery_method, v_name, v_email, v_phone, v_doc,
    case when p_delivery_method = 'envio' then v_addr end,
    case when p_delivery_method = 'envio' then v_city end,
    case when p_delivery_method = 'envio' then v_region end,
    v_ref, v_notes, v_subtotal, v_shipping, v_subtotal + v_shipping)
  returning * into v_order;

  insert into public.order_items (order_id, motorcycle_id, product_name, product_brand, color, unit_price, quantity, line_total)
  select v_order.id, (l ->> 'motorcycle_id')::uuid, l ->> 'name', l ->> 'brand', l ->> 'color',
         (l ->> 'price')::numeric, (l ->> 'qty')::int, (l ->> 'price')::numeric * (l ->> 'qty')::int
    from jsonb_array_elements(v_lines) l;

  insert into public.order_status_history (order_id, status, note, changed_by)
  values (v_order.id, 'pendiente', 'Pedido creado', v_uid);

  insert into public.payments (order_id, provider, status, amount)
  values (v_order.id, p_payment_method, 'pendiente', v_order.total);

  return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'total', v_order.total);
end $$;

-- ---------- cancelar pedido propio (solo si sigue pendiente y sin pago) ----------
create or replace function public.cancel_my_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id and user_id = auth.uid() for update;
  if not found then raise exception 'Pedido no encontrado.' using errcode = 'P0002'; end if;
  if v_order.status <> 'pendiente' or v_order.payment_status in ('aprobado', 'en_proceso') then
    raise exception 'Este pedido ya no se puede cancelar. Contáctanos.' using errcode = 'P0001';
  end if;
  perform public._restock_order(p_order_id);
  update public.orders
     set status = 'cancelado', cancelled_at = now(), cancel_reason = 'Cancelado por el cliente',
         payment_status = case when payment_status = 'pendiente' then 'cancelado'::public.payment_status else payment_status end
   where id = p_order_id;
  update public.payments set status = 'cancelado' where order_id = p_order_id and status = 'pendiente';
  insert into public.order_status_history (order_id, status, note, changed_by)
  values (p_order_id, 'cancelado', 'Cancelado por el cliente', auth.uid());
end $$;

-- ---------- estado de pedido (panel) ----------
create or replace function public.admin_update_order_status(
  p_order_id uuid, p_status public.order_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  if not public.has_role('admin', 'sales') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado.' using errcode = 'P0002'; end if;
  if v_order.status in ('cancelado', 'entregado') then
    raise exception 'El pedido ya está %. No se puede modificar.', v_order.status using errcode = 'P0001';
  end if;
  if p_status = v_order.status then
    raise exception 'El pedido ya tiene ese estado.' using errcode = 'P0001';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'Nota demasiado larga.' using errcode = '22023';
  end if;

  if p_status = 'cancelado' then
    perform public._restock_order(p_order_id);
    update public.orders
       set status = 'cancelado', cancelled_at = now(),
           cancel_reason = coalesce(nullif(trim(p_note), ''), 'Cancelado por la tienda'),
           payment_status = case when payment_status = 'pendiente' then 'cancelado'::public.payment_status else payment_status end
     where id = p_order_id;
    update public.payments set status = 'cancelado' where order_id = p_order_id and status = 'pendiente';
  else
    if public._status_rank(p_status) < public._status_rank(v_order.status) then
      raise exception 'No se puede retroceder el estado de un pedido.' using errcode = 'P0001';
    end if;
    update public.orders
       set status = p_status,
           confirmed_at = case when p_status in ('confirmado', 'preparando', 'enviado', 'entregado') then coalesce(confirmed_at, now()) else confirmed_at end,
           shipped_at   = case when p_status in ('enviado', 'entregado') then coalesce(shipped_at, now()) else shipped_at end,
           delivered_at = case when p_status = 'entregado' then now() else delivered_at end
     where id = p_order_id;
  end if;
  insert into public.order_status_history (order_id, status, note, changed_by)
  values (p_order_id, p_status, nullif(trim(p_note), ''), auth.uid());
end $$;

create or replace function public.admin_update_order_notes(p_order_id uuid, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin', 'sales') then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if p_notes is not null and char_length(p_notes) > 2000 then raise exception 'Nota demasiado larga.' using errcode = '22023'; end if;
  update public.orders set admin_notes = nullif(trim(p_notes), '') where id = p_order_id;
end $$;

-- ---------- pago manual (transferencia / pago en tienda) verificado por el equipo ----------
create or replace function public.admin_register_payment(
  p_order_id uuid, p_status public.payment_status, p_reference text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  if not public.has_role('admin', 'sales') then raise exception 'No autorizado.' using errcode = '42501'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado.' using errcode = 'P0002'; end if;
  if v_order.payment_method = 'mercadopago' then
    raise exception 'Los pagos con pasarela se actualizan automáticamente desde Mercado Pago.' using errcode = 'P0001';
  end if;
  if p_status not in ('aprobado', 'rechazado', 'reembolsado') then
    raise exception 'Estado de pago no válido.' using errcode = '22023';
  end if;
  if v_order.status = 'cancelado' and p_status = 'aprobado' then
    raise exception 'No se puede aprobar el pago de un pedido cancelado.' using errcode = 'P0001';
  end if;
  if p_status = 'aprobado' and (p_reference is null or char_length(trim(p_reference)) < 3) then
    raise exception 'Ingresa el número de operación o referencia del pago.' using errcode = '22023';
  end if;

  update public.payments
     set status = p_status, provider_payment_id = coalesce(nullif(trim(p_reference), ''), provider_payment_id),
         detail = 'Registrado manualmente', registered_by = auth.uid()
   where id = (select id from public.payments where order_id = p_order_id order by created_at desc limit 1);
  update public.orders set payment_status = p_status where id = p_order_id;

  if p_status = 'aprobado' and v_order.status = 'pendiente' then
    update public.orders set status = 'confirmado', confirmed_at = coalesce(confirmed_at, now()) where id = p_order_id;
    insert into public.order_status_history (order_id, status, note, changed_by)
    values (p_order_id, 'confirmado', 'Pago verificado', auth.uid());
  end if;
end $$;

-- ---------- pago desde la pasarela (solo service_role: Edge Function webhook) ----------
create or replace function public.apply_gateway_payment(
  p_order_id uuid, p_payment_id text, p_status public.payment_status,
  p_amount numeric, p_currency text, p_raw jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_order  public.orders;
  v_status public.payment_status := p_status;
  v_detail text := null;
  v_pid    uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.payment_method <> 'mercadopago' then
    raise exception 'Pedido no válido para la pasarela.' using errcode = 'P0002';
  end if;
  if v_status = 'aprobado' and (p_amount is distinct from v_order.total or upper(p_currency) <> v_order.currency) then
    v_status := 'en_proceso';
    v_detail := 'Monto o moneda no coinciden con el pedido: requiere revisión';
  end if;

  select id into v_pid from public.payments
   where provider = 'mercadopago' and provider_payment_id = p_payment_id;
  if v_pid is null then
    select id into v_pid from public.payments
     where order_id = p_order_id and provider = 'mercadopago' and provider_payment_id is null
     order by created_at desc limit 1;
  end if;
  if v_pid is null then
    insert into public.payments (order_id, provider, provider_payment_id, status, amount, currency, detail, raw)
    values (p_order_id, 'mercadopago', p_payment_id, v_status, coalesce(p_amount, 0), upper(coalesce(p_currency, 'PEN')), v_detail, p_raw);
  else
    update public.payments
       set provider_payment_id = p_payment_id, status = v_status, amount = coalesce(p_amount, amount),
           currency = upper(coalesce(p_currency, currency)), detail = v_detail, raw = p_raw
     where id = v_pid;
  end if;

  -- un pago aprobado solo puede pasar a reembolsado
  if v_order.payment_status = 'aprobado' and v_status <> 'reembolsado' then
    return;
  end if;
  update public.orders set payment_status = v_status where id = p_order_id;
  if v_status = 'aprobado' and v_order.status = 'pendiente' then
    update public.orders set status = 'confirmado', confirmed_at = coalesce(confirmed_at, now()) where id = p_order_id;
    insert into public.order_status_history (order_id, status, note)
    values (p_order_id, 'confirmado', 'Pago aprobado por Mercado Pago');
  end if;
end $$;

-- ---------- usuarios (panel) ----------
create or replace function public.admin_set_user_role(p_user uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'No puedes cambiar tu propio rol.' using errcode = 'P0001'; end if;
  update public.profiles set role = p_role where id = p_user;
  if not found then raise exception 'Usuario no encontrado.' using errcode = 'P0002'; end if;
end $$;

create or replace function public.admin_set_user_active(p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'No puedes desactivar tu propia cuenta.' using errcode = 'P0001'; end if;
  update public.profiles set is_active = p_active where id = p_user;
  if not found then raise exception 'Usuario no encontrado.' using errcode = 'P0002'; end if;
end $$;

create or replace function public.admin_customers()
returns table (id uuid, email text, full_name text, phone text, document_id text, city text, region text,
               role public.app_role, is_active boolean, created_at timestamptz,
               orders_count bigint, total_spent numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_role('admin', 'sales') then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return query
    select p.id, p.email, p.full_name, p.phone, p.document_id, p.city, p.region, p.role, p.is_active, p.created_at,
           count(o.id), coalesce(sum(o.total) filter (where o.payment_status = 'aprobado'), 0)
      from public.profiles p
      left join public.orders o on o.user_id = p.id
     group by p.id
     order by p.created_at desc;
end $$;

-- ---------- inventario (panel) ----------
create or replace function public.admin_inventory()
returns table (motorcycle_id uuid, name text, brand text, is_published boolean,
               stock int, low_stock_threshold int, sold bigint, reserved bigint, state text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  return query
    select m.id, m.name, m.brand, m.is_published, i.stock, i.low_stock_threshold,
           coalesce(sum(oi.quantity) filter (where o.status <> 'cancelado'
               and (o.payment_status = 'aprobado' or o.status <> 'pendiente')), 0)::bigint,
           coalesce(sum(oi.quantity) filter (where o.status = 'pendiente' and o.payment_status <> 'aprobado'), 0)::bigint,
           case when i.stock = 0 then 'agotado'
                when i.stock <= i.low_stock_threshold then 'bajo'
                else 'ok' end
      from public.motorcycles m
      join public.inventory i on i.motorcycle_id = m.id
      left join public.order_items oi on oi.motorcycle_id = m.id
      left join public.orders o on o.id = oi.order_id
     group by m.id, i.stock, i.low_stock_threshold
     order by i.stock asc, m.name;
end $$;

-- ---------- dashboard (panel) — todo sale de la base de datos ----------
create or replace function public.admin_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz    text := 'America/Lima';
  v_today date := (now() at time zone v_tz)::date;
  v_month date := date_trunc('month', now() at time zone v_tz)::date;
  r jsonb;
begin
  if not public.has_role('admin', 'sales') then raise exception 'No autorizado.' using errcode = '42501'; end if;
  with paid as (
    select p.amount, (p.updated_at at time zone v_tz) as at
      from public.payments p
      join public.orders o on o.id = p.order_id
     where p.status = 'aprobado' and o.status <> 'cancelado'
  ), months as (
    select generate_series(v_month - interval '11 months', v_month, interval '1 month')::date as m
  )
  select jsonb_build_object(
    'motorcycles_total', (select count(*) from public.motorcycles),
    'motorcycles_available', (select count(*) from public.motorcycles m join public.inventory i on i.motorcycle_id = m.id
                                where m.is_published and i.stock > 0),
    'motorcycles_sold_out', (select count(*) from public.inventory where stock = 0),
    'customers_total', (select count(*) from public.profiles where role = 'customer'),
    'orders_total', (select count(*) from public.orders),
    'orders_pending', (select count(*) from public.orders where status = 'pendiente'),
    'sales_today', (select coalesce(sum(amount), 0) from paid where at::date = v_today),
    'sales_month', (select coalesce(sum(amount), 0) from paid where at::date >= v_month),
    'revenue_total', (select coalesce(sum(amount), 0) from paid),
    'monthly', (select coalesce(jsonb_agg(jsonb_build_object(
                   'month', to_char(mo.m, 'YYYY-MM'),
                   'revenue', (select coalesce(sum(amount), 0) from paid where date_trunc('month', paid.at)::date = mo.m),
                   'orders', (select count(*) from public.orders o
                               where date_trunc('month', o.created_at at time zone v_tz)::date = mo.m
                                 and o.status <> 'cancelado')) order by mo.m), '[]'::jsonb)
                  from months mo),
    'top_products', (select coalesce(jsonb_agg(t order by t.units desc), '[]'::jsonb) from (
                       select oi.product_name as name, sum(oi.quantity)::int as units, sum(oi.line_total) as amount
                         from public.order_items oi join public.orders o on o.id = oi.order_id
                        where o.status <> 'cancelado'
                        group by oi.product_name order by sum(oi.quantity) desc limit 5) t),
    'by_status', (select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb) from (
                    select status::text, count(*) as n from public.orders group by status) s),
    'low_stock', (select count(*) from public.inventory where stock > 0 and stock <= low_stock_threshold)
  ) into r;
  return r;
end $$;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.profiles             enable row level security;
alter table public.categories           enable row level security;
alter table public.motorcycles          enable row level security;
alter table public.motorcycle_images    enable row level security;
alter table public.inventory            enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payments             enable row level security;
alter table public.site_settings        enable row level security;
alter table public.favorites            enable row level security;
alter table public.notifications        enable row level security;

-- profiles
create policy "perfil propio o equipo" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.has_role('admin', 'sales'));
create policy "editar perfil propio" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- categories
create policy "categorías públicas" on public.categories for select to anon, authenticated using (true);
create policy "catálogo crea categorías" on public.categories for insert to authenticated
  with check (public.has_role('admin', 'catalog'));
create policy "catálogo edita categorías" on public.categories for update to authenticated
  using (public.has_role('admin', 'catalog')) with check (public.has_role('admin', 'catalog'));
create policy "catálogo borra categorías" on public.categories for delete to authenticated
  using (public.has_role('admin', 'catalog'));

-- motorcycles
create policy "motos publicadas o equipo" on public.motorcycles for select to anon, authenticated
  using (is_published or public.is_staff());
create policy "catálogo crea motos" on public.motorcycles for insert to authenticated
  with check (public.has_role('admin', 'catalog'));
create policy "catálogo edita motos" on public.motorcycles for update to authenticated
  using (public.has_role('admin', 'catalog')) with check (public.has_role('admin', 'catalog'));
create policy "catálogo borra motos" on public.motorcycles for delete to authenticated
  using (public.has_role('admin', 'catalog'));

-- motorcycle_images
create policy "imágenes visibles" on public.motorcycle_images for select to anon, authenticated
  using (exists (select 1 from public.motorcycles m where m.id = motorcycle_id and (m.is_published or public.is_staff())));
create policy "catálogo crea imágenes" on public.motorcycle_images for insert to authenticated
  with check (public.has_role('admin', 'catalog'));
create policy "catálogo edita imágenes" on public.motorcycle_images for update to authenticated
  using (public.has_role('admin', 'catalog')) with check (public.has_role('admin', 'catalog'));
create policy "catálogo borra imágenes" on public.motorcycle_images for delete to authenticated
  using (public.has_role('admin', 'catalog'));

-- inventory (la disponibilidad es pública; solo catálogo la modifica)
create policy "stock visible" on public.inventory for select to anon, authenticated
  using (exists (select 1 from public.motorcycles m where m.id = motorcycle_id and (m.is_published or public.is_staff())));
create policy "catálogo edita stock" on public.inventory for update to authenticated
  using (public.has_role('admin', 'catalog')) with check (public.has_role('admin', 'catalog'));

-- orders / items / history / payments: lectura propia o del equipo de ventas. Escritura SOLO vía RPC.
create policy "pedidos propios o ventas" on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role('admin', 'sales'));
create policy "ítems visibles" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (o.user_id = (select auth.uid()) or public.has_role('admin', 'sales'))));
create policy "historial visible" on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (o.user_id = (select auth.uid()) or public.has_role('admin', 'sales'))));
create policy "pagos visibles" on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (o.user_id = (select auth.uid()) or public.has_role('admin', 'sales'))));

-- site_settings
create policy "ajustes públicos" on public.site_settings for select to anon, authenticated
  using (is_public or public.is_staff());
create policy "admin crea ajustes" on public.site_settings for insert to authenticated
  with check (public.has_role('admin') or (public.has_role('catalog') and key in ('home', 'contact', 'social')));
create policy "admin edita ajustes" on public.site_settings for update to authenticated
  using (public.has_role('admin') or (public.has_role('catalog') and key in ('home', 'contact', 'social')))
  with check (public.has_role('admin') or (public.has_role('catalog') and key in ('home', 'contact', 'social')));

-- favorites
create policy "favoritos propios" on public.favorites for select to authenticated using (user_id = (select auth.uid()));
create policy "agregar favorito" on public.favorites for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.motorcycles m where m.id = motorcycle_id and m.is_published));
create policy "quitar favorito" on public.favorites for delete to authenticated using (user_id = (select auth.uid()));

-- notifications
create policy "notificaciones propias" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) or (audience = 'staff' and public.has_role('admin', 'sales')));
create policy "marcar notificación leída" on public.notifications for update to authenticated
  using (user_id = (select auth.uid()) or (audience = 'staff' and public.has_role('admin', 'sales')))
  with check (user_id = (select auth.uid()) or (audience = 'staff' and public.has_role('admin', 'sales')));

-- =====================================================================
-- Permisos de tabla (defensa en profundidad, además de RLS)
-- =====================================================================
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.categories, public.motorcycles, public.motorcycle_images,
                public.inventory, public.site_settings to anon, authenticated;
grant insert, update, delete on public.categories, public.motorcycles, public.motorcycle_images to authenticated;
grant update (stock, low_stock_threshold) on public.inventory to authenticated;
grant insert, update on public.site_settings to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, phone, document_id, address, city, region) on public.profiles to authenticated;

grant select on public.orders, public.order_items, public.order_status_history, public.payments to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- funciones: nadie las ejecuta salvo quien corresponde
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.has_role(public.app_role[]) to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.create_order(jsonb, jsonb, text, text) to authenticated;
grant execute on function public.cancel_my_order(uuid) to authenticated;
grant execute on function public.admin_update_order_status(uuid, public.order_status, text) to authenticated;
grant execute on function public.admin_update_order_notes(uuid, text) to authenticated;
grant execute on function public.admin_register_payment(uuid, public.payment_status, text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;
grant execute on function public.admin_customers() to authenticated;
grant execute on function public.admin_inventory() to authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.apply_gateway_payment(uuid, text, public.payment_status, numeric, text, jsonb) to service_role;

-- Las funciones nuevas no se vuelven ejecutables por defecto
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- =====================================================================
-- Realtime: pedidos y notificaciones en vivo (respeta RLS)
-- =====================================================================
alter publication supabase_realtime add table public.orders, public.notifications, public.inventory;

-- =====================================================================
-- Storage: fotografías de motocicletas y del sitio
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('motorcycles', 'motorcycles', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

create policy "equipo lista fotos" on storage.objects for select to authenticated
  using (bucket_id = 'motorcycles' and public.is_staff());
create policy "catálogo sube fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'motorcycles' and public.has_role('admin', 'catalog'));
create policy "catálogo reemplaza fotos" on storage.objects for update to authenticated
  using (bucket_id = 'motorcycles' and public.has_role('admin', 'catalog'))
  with check (bucket_id = 'motorcycles' and public.has_role('admin', 'catalog'));
create policy "catálogo borra fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'motorcycles' and public.has_role('admin', 'catalog'));
