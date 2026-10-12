-- Video metadata and AI estimate columns used by the upload, trim and
-- analysis screens. Every change is additive and safe to run more than once.
-- Until this runs, the app keeps these values on the device instead.

alter table public.videos
  add column if not exists duration   numeric,
  add column if not exists trim_start numeric,
  add column if not exists trim_end   numeric,
  add column if not exists file_size  bigint;

alter table public.video_analysis
  add column if not exists est_distance_m    numeric,
  add column if not exists est_top_speed_kmh numeric,
  add column if not exists est_jump_cm       numeric,
  add column if not exists analyzed_seconds  numeric;

-- Library and profile screens filter videos by player, newest first, and
-- join analyses by video.
create index if not exists videos_player_created_idx on public.videos (player_id, created_at desc);
create index if not exists video_analysis_video_idx on public.video_analysis (video_id);

-- Make PostgREST pick up the new columns immediately.
notify pgrst, 'reload schema';
