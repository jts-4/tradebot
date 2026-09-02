-- Kâğıt işlemler
create table if not exists trades (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  side text not null check (side in ('BUY', 'SELL')),
  entry_price numeric not null,
  quantity numeric not null,
  notional numeric not null,
  stop_price numeric not null,
  target_price numeric not null,
  exit_price numeric,
  profit_loss numeric,
  exit_reason text check (exit_reason in ('TARGET', 'STOP', 'REGIME_CHANGE')),
  strategy_version text not null default '1.0.0',
  trigger_lookback int not null default 3,
  fisher_active boolean not null default false,
  created_at timestamptz default now(),
  closed_at timestamptz
);

-- Kaçan fırsatlar (sermaye yetersizliği)
create table if not exists missed_opportunities (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  side text not null check (side in ('BUY', 'SELL')),
  signal_price numeric not null,
  required_notional numeric not null,
  available_capital numeric not null,
  stop_price numeric not null,
  target_price numeric not null,
  reason text,
  created_at timestamptz default now()
);

-- Bot kararları
create table if not exists decisions (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  candle_open timestamptz not null,
  candle_close timestamptz not null,
  verdict text not null check (verdict in ('PASS', 'SKIP')),
  conditions jsonb not null default '[]',
  indicators jsonb not null default '[]',
  missing jsonb not null default '[]',
  fisher_active boolean not null default false,
  strategy_version text not null default '1.0.0',
  created_at timestamptz default now()
);

-- Bot durumu (tek satır)
create table if not exists bot_status (
  id int primary key default 1,
  last_run timestamptz not null default now(),
  next_run timestamptz not null default now(),
  halted boolean default false,
  halt_reason text,
  consecutive_losses int default 0,
  daily_loss numeric default 0,
  daily_loss_date date default current_date,
  peak_equity numeric default 10000,
  trigger_lookback int default 3
);

-- Hesap anlık görüntüsü
create table if not exists account_snapshots (
  id uuid default gen_random_uuid() primary key,
  equity numeric not null default 10000,
  total_return numeric not null default 0,
  allocated numeric not null default 0,
  available numeric not null default 10000,
  created_at timestamptz default now()
);

-- Enstrüman tetikleyici state
create table if not exists instrument_state (
  symbol text primary key,
  trigger_type text check (trigger_type in ('WT', 'FISHER')),
  trigger_bar_time bigint,
  trigger_direction text check (trigger_direction in ('LONG', 'SHORT'))
);

-- Başlangıç verileri
insert into bot_status (id, last_run, next_run, halted, peak_equity, trigger_lookback)
values (1, now(), now() + interval '1 hour', false, 10000, 3)
on conflict (id) do nothing;

insert into account_snapshots (equity, total_return, allocated, available)
values (10000, 0, 0, 10000);

-- BIST sinyal geçmişi
create table if not exists bist_signals (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  signal_type text not null default 'buy' check (signal_type in ('buy', 'sell', 'none')),
  price numeric not null,
  signals_4h text[] not null default '{}',
  signals_2h text[] not null default '{}',
  volume_ok boolean not null default false,
  created_at timestamptz default now()
);

-- Migration: mevcut tabloya signal_type ekle
alter table bist_signals add column if not exists signal_type text not null default 'buy' check (signal_type in ('buy', 'sell', 'none'));
create index if not exists bist_signals_symbol_idx on bist_signals(symbol, created_at desc);

-- BIST sinyal oturumları (başlangıçtan bitişe tam yaşam döngüsü)
create table if not exists bist_signal_sessions (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  signal_type text not null check (signal_type in ('buy', 'sell')),
  entry_price numeric not null,
  entry_at timestamptz not null default now(),
  max_price numeric not null,
  exit_price numeric,
  exit_at timestamptz,
  pnl_pct numeric,
  closed boolean not null default false
);
create index if not exists bist_signal_sessions_symbol_idx on bist_signal_sessions(symbol, entry_at desc);
