import { supabase } from './supabase';

/**
 * Small cached lookups used on almost every player screen.
 *
 * `supabase.auth.getUser()` makes a network round-trip every call, which the
 * old screens did several times per render. `getSession()` reads the locally
 * stored session instead, and the player profile id is cached in memory.
 */
let cachedPlayer: { userId: string; profile: any; at: number } | null = null;
const PLAYER_TTL_MS = 60_000;

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Returns the signed-in player's profile row (cached for a minute). */
export async function getMyPlayerProfile(force = false): Promise<any | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  if (!force && cachedPlayer && cachedPlayer.userId === userId && Date.now() - cachedPlayer.at < PLAYER_TTL_MS) {
    return cachedPlayer.profile;
  }
  const { data, error } = await supabase.from('player_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  cachedPlayer = data ? { userId, profile: data, at: Date.now() } : null;
  return data;
}

export function invalidatePlayerCache() {
  cachedPlayer = null;
}

supabase.auth.onAuthStateChange(() => invalidatePlayerCache());
