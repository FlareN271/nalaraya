-- Nalaraya: skema database Supabase
-- Jalankan sekali di Supabase Dashboard > SQL Editor > New query > Run.
-- Setiap baris data milik satu pengguna (user_id). Row Level Security
-- memastikan hanya pemiliknya yang bisa membaca dan mengubahnya.

create table if not exists public.profil (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null,            -- pengaturan, quest, ekspedisi, status harian
  updated_at timestamptz not null default now()
);

create table if not exists public.kartu (
  user_id    uuid not null references auth.users(id) on delete cascade,
  id         text not null,             -- id kartu dari aplikasi
  data       jsonb not null,            -- depan, belakang, rak, jilid, jadwal ulang
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.log_sesi (
  user_id    uuid not null references auth.users(id) on delete cascade,
  bulan      text not null,             -- format YYYY-MM, satu baris per bulan
  data       jsonb not null,            -- { "sesi": [ ... ] }
  updated_at timestamptz not null default now(),
  primary key (user_id, bulan)
);

alter table public.profil   enable row level security;
alter table public.kartu    enable row level security;
alter table public.log_sesi enable row level security;

drop policy if exists "milik sendiri" on public.profil;
drop policy if exists "milik sendiri" on public.kartu;
drop policy if exists "milik sendiri" on public.log_sesi;

create policy "milik sendiri" on public.profil
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "milik sendiri" on public.kartu
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "milik sendiri" on public.log_sesi
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
