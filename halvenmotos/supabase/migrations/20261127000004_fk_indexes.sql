-- Índices para claves foráneas señaladas por el asesor de rendimiento de Supabase
create index if not exists notifications_order_idx on public.notifications (order_id);
create index if not exists order_status_history_changed_by_idx on public.order_status_history (changed_by);
create index if not exists payments_registered_by_idx on public.payments (registered_by);
create index if not exists site_settings_updated_by_idx on public.site_settings (updated_by);
