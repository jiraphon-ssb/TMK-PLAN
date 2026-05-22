create table if not exists public.tmk_campaigns (
  id text primary key,
  name text not null,
  color text not null default '#3b82f6',
  bg text not null default '#eff6ff',
  border text not null default '#bfdbfe',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_channels (
  id text primary key,
  name text not null,
  percentage numeric not null default 0,
  actual numeric not null default 0,
  color text not null default '#3b82f6',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_products (
  id text primary key,
  name text not null,
  price numeric not null default 0,
  target_units integer not null default 0,
  actual_units integer not null default 0,
  stock_on_hand integer not null default 0,
  reserved_units integer not null default 0,
  reorder_point integer not null default 0,
  strategy text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_tasks (
  id text primary key,
  date date not null,
  camp text references public.tmk_campaigns(id) on delete set null,
  title text not null,
  detail text not null default '',
  responsible text not null default '',
  channel text not null default '',
  status text not null default 'todo' check (status in ('todo', 'inprogress', 'review', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  reminder_days integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_task_checklist (
  id text primary key,
  task_id text not null references public.tmk_tasks(id) on delete cascade,
  text text not null,
  completed boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_task_comments (
  id text primary key,
  task_id text not null references public.tmk_tasks(id) on delete cascade,
  text text not null,
  author text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_task_attachments (
  id text primary key,
  task_id text not null references public.tmk_tasks(id) on delete cascade,
  label text not null default '',
  url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_purchase_orders (
  id text primary key,
  product text not null,
  quantity integer not null default 0,
  order_date date not null,
  arrival_date date not null,
  status text not null default 'Pending' check (status in ('Pending', 'Completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tmk_settings (
  id text primary key default 'main',
  total_target numeric not null default 0,
  total_units_target integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists tmk_tasks_date_idx on public.tmk_tasks(date);
create index if not exists tmk_tasks_camp_idx on public.tmk_tasks(camp);
create index if not exists tmk_task_checklist_task_id_idx on public.tmk_task_checklist(task_id);
create index if not exists tmk_task_comments_task_id_idx on public.tmk_task_comments(task_id);
create index if not exists tmk_task_attachments_task_id_idx on public.tmk_task_attachments(task_id);
create index if not exists tmk_purchase_orders_arrival_date_idx on public.tmk_purchase_orders(arrival_date);

create or replace function public.tmk_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tmk_campaigns_touch_updated_at on public.tmk_campaigns;
create trigger tmk_campaigns_touch_updated_at
before update on public.tmk_campaigns
for each row execute function public.tmk_touch_updated_at();

drop trigger if exists tmk_channels_touch_updated_at on public.tmk_channels;
create trigger tmk_channels_touch_updated_at
before update on public.tmk_channels
for each row execute function public.tmk_touch_updated_at();

drop trigger if exists tmk_products_touch_updated_at on public.tmk_products;
create trigger tmk_products_touch_updated_at
before update on public.tmk_products
for each row execute function public.tmk_touch_updated_at();

drop trigger if exists tmk_tasks_touch_updated_at on public.tmk_tasks;
create trigger tmk_tasks_touch_updated_at
before update on public.tmk_tasks
for each row execute function public.tmk_touch_updated_at();

drop trigger if exists tmk_task_checklist_touch_updated_at on public.tmk_task_checklist;
create trigger tmk_task_checklist_touch_updated_at
before update on public.tmk_task_checklist
for each row execute function public.tmk_touch_updated_at();

drop trigger if exists tmk_task_comments_touch_updated_at on public.tmk_task_comments;
create trigger tmk_task_comments_touch_updated_at
before update on public.tmk_task_comments
for each row execute function public.tmk_touch_updated_at();

drop trigger if exists tmk_task_attachments_touch_updated_at on public.tmk_task_attachments;
create trigger tmk_task_attachments_touch_updated_at
before update on public.tmk_task_attachments
for each row execute function public.tmk_touch_updated_at();

drop trigger if exists tmk_purchase_orders_touch_updated_at on public.tmk_purchase_orders;
create trigger tmk_purchase_orders_touch_updated_at
before update on public.tmk_purchase_orders
for each row execute function public.tmk_touch_updated_at();

alter table public.tmk_campaigns replica identity full;
alter table public.tmk_channels replica identity full;
alter table public.tmk_products replica identity full;
alter table public.tmk_tasks replica identity full;
alter table public.tmk_task_checklist replica identity full;
alter table public.tmk_task_comments replica identity full;
alter table public.tmk_task_attachments replica identity full;
alter table public.tmk_purchase_orders replica identity full;
alter table public.tmk_settings replica identity full;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tmk_campaigns',
    'tmk_channels',
    'tmk_products',
    'tmk_tasks',
    'tmk_task_checklist',
    'tmk_task_comments',
    'tmk_task_attachments',
    'tmk_purchase_orders',
    'tmk_settings'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

-- Phase 1: no complex roles yet. Keep access simple while the app has no login.
-- Add RLS policies before exposing this project to untrusted users.
