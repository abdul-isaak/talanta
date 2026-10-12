-- Row Level Security for every public table and the video storage bucket.
-- Each user can read what the app shows them and change only their own data;
-- administrators (rows in public.admins) can read everything.

-- ---------- helper functions (run with definer rights, no recursion) ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.my_player_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.player_profiles where user_id = auth.uid() limit 1;
$$;

create or replace function public.my_scout_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.scout_profiles where user_id = auth.uid() limit 1;
$$;

-- Registration inserts the profile right after sign-up, before the email code
-- is confirmed, so there is no session yet. Allow it only for a brand-new,
-- still-unconfirmed account whose email matches.
create or replace function public.is_pending_signup(uid uuid, mail text) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users u
    where u.id = uid and lower(u.email) = lower(mail)
      and u.email_confirmed_at is null and u.created_at > now() - interval '1 day'
  );
$$;

create or replace function public.is_pending_signup_email(mail text) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users u
    where lower(u.email) = lower(mail)
      and u.email_confirmed_at is null and u.created_at > now() - interval '1 day'
  );
$$;

revoke all on function public.is_pending_signup(uuid, text) from public;
revoke all on function public.is_pending_signup_email(text) from public;
grant execute on function public.is_admin(), public.my_player_id(), public.my_scout_id() to anon, authenticated;
grant execute on function public.is_pending_signup(uuid, text), public.is_pending_signup_email(text) to anon, authenticated;

-- ---------- enable RLS ----------
alter table public.profiles enable row level security;
alter table public.player_profiles enable row level security;
alter table public.scout_profiles enable row level security;
alter table public.videos enable row level security;
alter table public.shortlists enable row level security;
alter table public.invitations enable row level security;
alter table public.messages enable row level security;

-- ---------- replace the old permissive policies ----------
drop policy if exists "Authenticated can insert admins" on public.admins;
drop policy if exists "Anyone can read admins" on public.admins;
drop policy if exists "Anyone can read logs" on public.activity_logs;
drop policy if exists "Anyone can insert codes" on public.verification_codes;
drop policy if exists "Anyone can read codes" on public.verification_codes;
drop policy if exists "Anyone can update codes" on public.verification_codes;
drop policy if exists "Authenticated can insert analysis" on public.video_analysis;
drop policy if exists "Anyone can read analysis" on public.video_analysis;
drop policy if exists "Authenticated can update analysis" on public.video_analysis;

-- profiles (legacy summary row written at registration)
create policy "profiles_insert_at_signup" on public.profiles for insert to anon, authenticated
  with check (public.is_pending_signup_email(email) or lower(email) = lower(auth.jwt() ->> 'email'));
create policy "profiles_admin_read" on public.profiles for select to authenticated using (public.is_admin());

-- player_profiles
create policy "players_read" on public.player_profiles for select to authenticated using (true);
create policy "players_insert_own" on public.player_profiles for insert to anon, authenticated
  with check (user_id = auth.uid() or public.is_pending_signup(user_id, email));
create policy "players_update_own" on public.player_profiles for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "players_delete_own" on public.player_profiles for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- scout_profiles
create policy "scouts_read" on public.scout_profiles for select to authenticated using (true);
create policy "scouts_insert_own" on public.scout_profiles for insert to anon, authenticated
  with check (user_id = auth.uid() or public.is_pending_signup(user_id, email));
create policy "scouts_update_own" on public.scout_profiles for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "scouts_delete_own" on public.scout_profiles for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- videos
create policy "videos_read" on public.videos for select to authenticated using (true);
create policy "videos_insert_own" on public.videos for insert to authenticated with check (player_id = public.my_player_id());
create policy "videos_update_own" on public.videos for update to authenticated
  using (player_id = public.my_player_id() or public.is_admin()) with check (player_id = public.my_player_id() or public.is_admin());
create policy "videos_delete_own" on public.videos for delete to authenticated
  using (player_id = public.my_player_id() or public.is_admin());

-- video_analysis (written by the player who owns the video)
create policy "analysis_read" on public.video_analysis for select to authenticated using (true);
create policy "analysis_insert_own" on public.video_analysis for insert to authenticated
  with check (video_id in (select id from public.videos where player_id = public.my_player_id()));
create policy "analysis_update_own" on public.video_analysis for update to authenticated
  using (video_id in (select id from public.videos where player_id = public.my_player_id()))
  with check (video_id in (select id from public.videos where player_id = public.my_player_id()));
create policy "analysis_delete_own" on public.video_analysis for delete to authenticated
  using (video_id in (select id from public.videos where player_id = public.my_player_id()) or public.is_admin());

-- shortlists (private to the scout)
create policy "shortlists_read" on public.shortlists for select to authenticated using (scout_id = public.my_scout_id() or public.is_admin());
create policy "shortlists_insert" on public.shortlists for insert to authenticated with check (scout_id = public.my_scout_id());
create policy "shortlists_update" on public.shortlists for update to authenticated using (scout_id = public.my_scout_id()) with check (scout_id = public.my_scout_id());
create policy "shortlists_delete" on public.shortlists for delete to authenticated using (scout_id = public.my_scout_id());

-- invitations (scout who sent it and player who received it)
create policy "invitations_read" on public.invitations for select to authenticated
  using (scout_id = public.my_scout_id() or player_id = public.my_player_id() or public.is_admin());
create policy "invitations_insert" on public.invitations for insert to authenticated with check (scout_id = public.my_scout_id());
create policy "invitations_update" on public.invitations for update to authenticated
  using (scout_id = public.my_scout_id() or player_id = public.my_player_id())
  with check (scout_id = public.my_scout_id() or player_id = public.my_player_id());
create policy "invitations_delete" on public.invitations for delete to authenticated using (scout_id = public.my_scout_id());

-- messages (sender and receiver only)
create policy "messages_read" on public.messages for select to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid() or public.is_admin());
create policy "messages_insert" on public.messages for insert to authenticated with check (sender_id = auth.uid());
create policy "messages_update" on public.messages for update to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid()) with check (sender_id = auth.uid() or receiver_id = auth.uid());

-- admins: a user may check their own row; only existing admins see the list; nobody can self-promote
create policy "admins_read" on public.admins for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- activity_logs: anyone may append (registration logs before sign-in); only admins read
create policy "logs_admin_read" on public.activity_logs for select to authenticated using (public.is_admin());

-- verification_codes: unused by the app; RLS stays on with no policies, so it is locked.

-- ---------- storage: files are named "<auth user id>_<timestamp>..." ----------
drop policy if exists "Authenticated users can upload videos" on storage.objects;
drop policy if exists "Authenticated users can delete videos" on storage.objects;
drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "videos_upload_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'player-videos' and name like auth.uid()::text || '\_%');
create policy "videos_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'player-videos' and (name like auth.uid()::text || '\_%' or public.is_admin()));
create policy "avatars_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name like auth.uid()::text || '\_%');
