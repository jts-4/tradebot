-- Gerçekleşen işlemler
create table trades (
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
create table missed_trades (
  id uuid default gen_random_uuid() primary key,
  symbol text not null,
  side text not null check (side in ('BUY', 'SELL')),
  signal_price numeric not null,
  current_price numeric,
  reason text,
  created_at timestamptz default now()
);
