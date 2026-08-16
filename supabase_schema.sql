-- Gerçekleşen işlemler
create table if not exists trades (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  side text not null check (side in ('BUY', 'SELL')),
  price numeric not null,
  quantity numeric not null,
  total numeric not null,
  profit_loss numeric,
  created_at timestamptz default now()
);

-- Kaçırılmış işlemler
create table if not exists missed_trades (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  side text not null check (side in ('BUY', 'SELL')),
  signal_price numeric not null,
  current_price numeric,
  reason text,
  created_at timestamptz default now()
);

-- Bot kararları (son karar kartı için)
create table if not exists decisions (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  candle_open timestamptz not null,
  candle_close timestamptz not null,
  verdict text not null check (verdict in ('PASS', 'SKIP')),
  conditions jsonb not null default '[]',
  indicators jsonb not null default '[]',
  missing jsonb not null default '[]',
  candle_highlighted boolean default true,
  created_at timestamptz default now()
);

-- Bot durumu (tek satır, upsert ile güncellenir)
create table if not exists bot_status (
  id int primary key default 1,
  last_run timestamptz not null default now(),
  next_run timestamptz not null default now(),
  halted boolean default false,
  halt_reason text
);

-- Hesap anlık görüntüsü (en son satır kullanılır)
create table if not exists account_snapshots (
  id uuid default gen_random_uuid() primary key,
  equity numeric not null default 0,
  total_return numeric not null default 0,
  allocated numeric not null default 0,
  available numeric not null default 0,
  created_at timestamptz default now()
);

-- Başlangıç bot_status satırı
insert into bot_status (id, last_run, next_run, halted)
values (1, now(), now() + interval '5 minutes', false)
on conflict (id) do nothing;
