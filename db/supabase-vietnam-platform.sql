-- =============================================================================
-- BẢN ĐỒ AN TOÀN & NGHIÊN CỨU THIÊN TAI VIỆT NAM
-- LƯỢC ĐỒ SUPABASE (PostgreSQL 16 + PostGIS + Auth + Row-Level Security)
-- Chạy 1 lần trong Supabase SQL Editor (gói Free Plan đã gắn trên Vercel Team)
-- =============================================================================

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- 1. HỒ SƠ NHÀ NGHIÊN CỨU (Liên kết 1-1 với auth.users của Supabase Auth)
create table if not exists public.researcher_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  organization text not null,
  specialty text not null,
  focus_province text not null,
  bio text default '',
  role text not null default 'researcher' check (role in ('researcher', 'reviewer', 'admin')),
  verification_status text not null default 'verified' check (verification_status in ('pending', 'verified', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. VÙNG NGHIÊN CỨU & HỒ SƠ ĐỀ XUẤT DỮ LIỆU ĐẨY LÊN BẢN ĐỒ CHÍNH
create table if not exists public.research_submissions (
  id text primary key,
  researcher_id uuid references public.researcher_profiles(id) on delete set null,
  author_name text not null,
  organization text not null,
  title text not null,
  province text not null,
  macro_region text not null check (macro_region in ('bac', 'trung', 'tay-nguyen', 'nam', 'dbscl')),
  hazard_type text not null check (hazard_type in ('flood', 'landslide', 'heat', 'air_quality', 'salinity', 'storm', 'environment')),
  data_class text not null check (data_class in ('OBSERVED_DATA', 'MODELLED_DATA', 'SATELLITE_DATA', 'FORECAST_DATA', 'COMMUNITY_REPORTS', 'SIMULATED_DATA')),
  center_geom geometry(Point, 4326) not null,
  radius_km numeric(5,2) not null default 5.0 check (radius_km > 0 and radius_km <= 100),
  summary text not null,
  methodology text not null,
  limitations text not null,
  license text not null default 'CC BY 4.0',
  feature_count integer not null default 0,
  status text not null default 'pending_review' check (status in ('draft', 'pending_review', 'published', 'rejected')),
  review_note text default '',
  reviewed_by text,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_research_submissions_geom on public.research_submissions using gist (center_geom);
create index if not exists idx_research_submissions_status on public.research_submissions (status, published_at desc);

-- 3. CÁC ĐIỂM / ĐỐI TƯỢNG KHÔNG GIAN TRÊN BẢN ĐỒ CHÍNH (Chỉ truy vấn theo khoanh vùng ST_DWithin!)
create table if not exists public.spatial_features (
  id text primary key,
  submission_id text references public.research_submissions(id) on delete cascade,
  province text not null,
  layer_group text not null check (layer_group in ('risk', 'safe')),
  category text not null check (category in ('flood', 'landslide', 'heat', 'traffic', 'air_quality', 'salinity', 'shelter', 'medical')),
  name text not null,
  geom geometry(Point, 4326) not null,
  data_class text not null default 'OBSERVED_DATA',
  confidence_tier text not null default 'B' check (confidence_tier in ('A', 'B', 'C')),
  status text not null default 'approved' check (status in ('pending', 'approved', 'hidden')),
  source_citation text not null,
  notes text default '',
  confirm_count integer not null default 1,
  observed_date date,
  created_at timestamptz not null default now()
);

create index if not exists idx_spatial_features_geom on public.spatial_features using gist (geom);
create index if not exists idx_spatial_features_status on public.spatial_features (status, layer_group);

-- 4. BẢN TIN THIÊN TAI, MÔI TRƯỜNG & BÀI NGHIÊN CỨU MỞ (PHẦN 3)
create table if not exists public.publications_feed (
  id text primary key,
  kind text not null check (kind in ('disaster_news', 'research_article')),
  submission_id text references public.research_submissions(id) on delete set null,
  title text not null,
  summary text not null,
  body text not null,
  author_name text not null,
  organization text not null,
  province text not null,
  macro_region text not null check (macro_region in ('bac', 'trung', 'tay-nguyen', 'nam', 'dbscl')),
  hazard_type text not null,
  severity text not null default 'info' check (severity in ('info', 'attention', 'high')),
  source_label text not null,
  data_class text not null default 'OBSERVED_DATA',
  focus_lat double precision not null,
  focus_lng double precision not null,
  focus_radius_km numeric(5,2) not null default 5.0,
  status text not null default 'published' check (status in ('pending_review', 'published', 'archived')),
  published_at timestamptz not null default now()
);

create index if not exists idx_publications_feed_status on public.publications_feed (status, kind, published_at desc);

-- 5. HÀM RPC CHỐNG LAG: CHỈ LẤY CÁC ĐỐI TƯỢNG NẰM TRONG VÒNG KHOANH VÙNG (ST_DWithin)
create or replace function public.get_features_in_zone(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 5.0,
  p_limit integer default 250
)
returns table (
  id text,
  submission_id text,
  province text,
  layer_group text,
  category text,
  name text,
  lat double precision,
  lng double precision,
  data_class text,
  confidence_tier text,
  source_citation text,
  notes text,
  confirm_count integer,
  observed_date date,
  distance_meters double precision
)
language sql
stable
as $$
  select
    f.id,
    f.submission_id,
    f.province,
    f.layer_group,
    f.category,
    f.name,
    st_y(f.geom) as lat,
    st_x(f.geom) as lng,
    f.data_class,
    f.confidence_tier,
    f.source_citation,
    f.notes,
    f.confirm_count,
    f.observed_date,
    st_distance(f.geom::geography, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) as distance_meters
  from public.spatial_features f
  where f.status = 'approved'
    and st_dwithin(
      f.geom::geography,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      least(greatest(p_radius_km, 0.5), 100.0) * 1000.0
    )
  order by distance_meters asc
  limit least(greatest(p_limit, 1), 400);
$$;

-- 6. CHÍNH SÁCH BẢO MẬT ROW-LEVEL SECURITY (RLS)
alter table public.researcher_profiles enable row level security;
alter table public.research_submissions enable row level security;
alter table public.spatial_features enable row level security;
alter table public.publications_feed enable row level security;

-- Công khai đọc dữ liệu đã duyệt (Phần 1 & Phần 3)
create policy "Public read approved spatial features"
  on public.spatial_features for select
  using (status = 'approved');

create policy "Public read published news and research"
  on public.publications_feed for select
  using (status = 'published');

create policy "Public read published study zones"
  on public.research_submissions for select
  using (status = 'published');

-- Nhà nghiên cứu đăng nhập quản lý hồ sơ và bài nộp của chính mình (Phần 2)
create policy "Researcher read own profile"
  on public.researcher_profiles for select
  using (auth.uid() = id);

create policy "Researcher create own submission"
  on public.research_submissions for insert
  with check (auth.uid() = researcher_id and status = 'pending_review');

create policy "Researcher read own submissions"
  on public.research_submissions for select
  using (auth.uid() = researcher_id);
