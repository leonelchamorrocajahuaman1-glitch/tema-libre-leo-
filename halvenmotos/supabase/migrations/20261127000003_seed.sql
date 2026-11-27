-- =====================================================================
-- HALVEN MOTOS — datos iniciales
-- Catálogo inicial (las cuatro ediciones del hero original) y ajustes.
-- NO se crean pedidos, pagos ni clientes: todo eso nace del uso real.
-- Los precios, stock y fichas de estas motos son valores de arranque:
-- revísalos en el panel (/admin) antes de abrir la tienda.
-- =====================================================================

insert into public.categories (name, slug, description, sort_order) values
  ('Deportivas', 'deportivas', 'Superbikes y supersport de alto rendimiento para pista y carretera.', 1),
  ('Naked',      'naked',      'Potencia sin carenado, postura erguida y manejo ágil.', 2),
  ('Touring',    'touring',    'Confort, protección y autonomía para viajes largos.', 3),
  ('Urbanas',    'urbanas',    'Motos ligeras y eficientes para la ciudad.', 4),
  ('Adventure',  'adventure',  'Trail y doble propósito para asfalto y tierra.', 5),
  ('Enduro',     'enduro',     'Off-road puro: ligeras, robustas y con gran recorrido de suspensión.', 6);

with cat as (select id from public.categories where slug = 'deportivas'),
ins as (
  insert into public.motorcycles (
    slug, name, brand, model, year, category_id, price, displacement_cc, power_hp, top_speed_kmh,
    acceleration_s, engine_type, transmission, brakes, tank_l, range_km, weight_kg, cooling, seats,
    short_description, description, colors, hero_image, hero_color, is_featured, is_published, sort_order)
  select v.slug, v.name, 'Halven', v.model, 2026, (select id from cat), v.price, 1200, v.hp, 299,
         2.9, 'V4 1200 cc, 4 tiempos, 16 válvulas', 'Manual de 6 velocidades con quickshifter bidireccional',
         'Doble disco delantero de 330 mm con pinzas radiales de 4 pistones, disco trasero de 245 mm, ABS en curva',
         17.0, 310, v.kg, 'Líquida', 2,
         v.short, v.descr, jsonb_build_array(jsonb_build_object('name', v.color, 'hex', v.hex)),
         v.hero, v.hex, true, true, v.ord
    from (values
      ('halven-rs-v4-magenta-satin', 'Halven RS-V4 Magenta Satin', 'RS-V4 1200', 89900.00, 208.0, 199,
       'Magenta satin', '#782956', 'sheet:0', 1,
       'Superbike V4 de 1200 cc con acabado magenta satinado.',
       'La RS-V4 es la superbike insignia de Halven. Su motor V4 de 1200 cc entrega una respuesta lineal desde bajas vueltas y un empuje brutal en la parte alta del cuentavueltas. Chasis de aluminio, electrónica de última generación con control de tracción y de wheelie, y una ergonomía pensada tanto para la pista como para la carretera. Edición con pintura magenta satinada.'),
      ('halven-rs-v4-deep-sapphire', 'Halven RS-V4 Deep Sapphire', 'RS-V4 1200 S', 96900.00, 214.0, 197,
       'Deep sapphire', '#033878', 'sheet:1', 2,
       'Versión S con suspensión semiactiva y acabado azul zafiro.',
       'La RS-V4 S suma suspensión electrónica semiactiva, llantas forjadas y modos de conducción ampliados sobre la base de la RS-V4. El acabado azul zafiro profundo resalta las líneas del carenado. Ideal para quien quiere el máximo rendimiento sin renunciar al confort en ruta.'),
      ('halven-rs-v4-cocoa-copper', 'Halven RS-V4 Cocoa Copper', 'RS-V4 1200', 89900.00, 208.0, 199,
       'Cocoa copper', '#593429', 'sheet:2', 3,
       'Superbike V4 de 1200 cc con acabado cobre cacao.',
       'Misma plataforma V4 de 1200 cc de la RS-V4, con una pintura cobre cacao de acabado satinado que cambia de tono según la luz. Electrónica completa, quickshifter bidireccional y frenos radiales para una conducción deportiva y precisa.'),
      ('halven-rs-v4-violet-pearl', 'Halven RS-V4 Violet Pearl', 'RS-V4 1200 S', 96900.00, 214.0, 197,
       'Violet pearl', '#5b44a7', 'sheet:3', 4,
       'Versión S con pintura violeta perlado.',
       'La RS-V4 S en violeta perlado combina suspensión semiactiva, llantas forjadas y toda la electrónica de la gama alta de Halven. Una superbike exclusiva, con presencia en cualquier lugar.')
    ) as v(slug, name, model, price, hp, kg, color, hex, hero, ord, short, descr)
  returning id, hero_image, name, slug
)
insert into public.motorcycle_images (motorcycle_id, url, alt, sort_order)
select id, hero_image, name, 0 from ins;

update public.inventory i set stock = s.stock, low_stock_threshold = 1
  from (values ('halven-rs-v4-magenta-satin', 3), ('halven-rs-v4-deep-sapphire', 2),
               ('halven-rs-v4-cocoa-copper', 3), ('halven-rs-v4-violet-pearl', 2)) s(slug, stock)
  join public.motorcycles m on m.slug = s.slug
 where i.motorcycle_id = m.id;

insert into public.site_settings (key, value, is_public) values
('store', jsonb_build_object(
   'name', 'HALVEN MOTOS', 'logo_url', null, 'currency', 'PEN', 'currency_symbol', 'S/',
   'legal_name', '', 'ruc', '', 'tagline', 'Motocicletas deportivas y de alto rendimiento'), true),
('contact', jsonb_build_object(
   'whatsapp', '', 'phone', '', 'email', '', 'address', '', 'city', '', 'hours', '', 'map_url', ''), true),
('social', jsonb_build_object('instagram', '', 'facebook', '', 'tiktok', '', 'youtube', ''), true),
('home', jsonb_build_object(
   'hero_word', 'RIDE OUT',
   'hero_cta', 'Explorar motocicletas',
   'catalog_title', 'Catálogo',
   'catalog_subtitle', 'Deportivas, naked, touring, urbanas y adventure. Elige la tuya.',
   'about_title', 'Nacidos para rodar',
   'about_text', 'En HALVEN MOTOS seleccionamos motocicletas de alto rendimiento y acompañamos a cada piloto desde la primera prueba hasta el mantenimiento. Asesoría honesta, entrega documentada y un equipo que vive las dos ruedas.',
   'services', jsonb_build_array(
     jsonb_build_object('title', 'Asesoría personalizada', 'text', 'Te ayudamos a elegir la moto adecuada según tu experiencia, uso y presupuesto.'),
     jsonb_build_object('title', 'Financiamiento', 'text', 'Consulta opciones de pago en cuotas con entidades financieras aliadas.'),
     jsonb_build_object('title', 'Entrega y documentación', 'text', 'Gestionamos la tarjeta de propiedad y la placa para que salgas rodando.'),
     jsonb_build_object('title', 'Taller y mantenimiento', 'text', 'Mantenimiento preventivo, diagnóstico electrónico y repuestos originales.')),
   'faq', jsonb_build_array(
     jsonb_build_object('q', '¿Cómo compro una motocicleta?', 'a', 'Elige tu moto, agrégala al carrito, completa tus datos y el método de pago. Recibirás el número de pedido y podrás seguir su estado en "Mis pedidos".'),
     jsonb_build_object('q', '¿Qué métodos de pago aceptan?', 'a', 'Los métodos habilitados aparecen al finalizar la compra. Los pagos por transferencia se verifican manualmente antes de confirmar el pedido.'),
     jsonb_build_object('q', '¿Hacen envíos a provincias?', 'a', 'Sí, coordinamos el traslado. También puedes recoger tu moto en tienda.'),
     jsonb_build_object('q', '¿Puedo cancelar un pedido?', 'a', 'Puedes cancelarlo desde "Mis pedidos" mientras siga pendiente y sin pago aprobado. En otros casos, contáctanos.'),
     jsonb_build_object('q', '¿Las motos incluyen garantía?', 'a', 'Todas las motocicletas nuevas incluyen la garantía del fabricante. Consulta las condiciones de cada modelo.')),
   'gallery', jsonb_build_array()), true),
('payments', jsonb_build_object(
   'mercadopago', jsonb_build_object('enabled', false, 'label', 'Tarjeta, Yape o PagoEfectivo (Mercado Pago)'),
   'transferencia', jsonb_build_object('enabled', true, 'label', 'Transferencia bancaria', 'instructions', ''),
   'tienda', jsonb_build_object('enabled', true, 'label', 'Pago en tienda', 'instructions', '')), true),
('shipping', jsonb_build_object('envio_cost', 0, 'free_from', null, 'note', 'El costo de traslado se coordina según el destino.'), true),
('legal', jsonb_build_object('privacy', '', 'terms', ''), true);
