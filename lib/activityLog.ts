import { supabase } from './supabase';

/**
 * Records a user action to the activity_logs table.
 * Fire-and-forget — never blocks or breaks the calling screen.
 */
export type LogAction =
  | 'login'
  | 'logout'
  | 'register'
  | 'profile_update'
  | 'video_upload'
  | 'video_delete'
  | 'ai_analysis'
  | 'shortlist_add'
  | 'shortlist_remove'
  | 'invitation_sent'
  | 'invitation_accepted'
  | 'invitation_declined'
  | 'message_sent';

export const ACTION_META: Record<string, { label: string; icon: string; color: string }> = {
  login:                { label: 'Signed in',            icon: '🔓', color: '#3BE097' },
  logout:               { label: 'Signed out',           icon: '🔒', color: '#7a99b0' },
  register:             { label: 'Registered',           icon: '✨', color: '#3BE097' },
  profile_update:       { label: 'Updated profile',      icon: '✏️', color: '#4a9eff' },
  video_upload:         { label: 'Uploaded video',       icon: '🎥', color: '#4a9eff' },
  video_delete:         { label: 'Deleted video',        icon: '🗑️', color: '#ff6b6b' },
  ai_analysis:          { label: 'Ran AI analysis',      icon: '🤖', color: '#3BE097' },
  shortlist_add:        { label: 'Shortlisted player',   icon: '⭐', color: '#f5a623' },
  shortlist_remove:     { label: 'Removed shortlist',    icon: '☆',  color: '#7a99b0' },
  invitation_sent:      { label: 'Sent trial invite',    icon: '📅', color: '#f5a623' },
  invitation_accepted:  { label: 'Accepted invite',      icon: '✅', color: '#3BE097' },
  invitation_declined:  { label: 'Declined invite',      icon: '❌', color: '#ff6b6b' },
  message_sent:         { label: 'Sent message',         icon: '💬', color: '#4a9eff' },
};

/**
 * Log an action. Looks up the current user's name and role automatically.
 * Pass explicit overrides when the user isn't signed in yet (e.g. register).
 */
export async function logActivity(
  action: LogAction,
  details?: string,
  override?: { userId?: string; email?: string; name?: string; role?: string }
) {
  try {
    let userId = override?.userId;
    let email = override?.email;
    let name = override?.name;
    let role = override?.role;

    if (!userId) {
      const { data } = await supabase.auth.getUser();
      userId = data?.user?.id;
      email = email || data?.user?.email || undefined;
    }

    if (!userId) return; // nothing to log against

    // Resolve name and role if not supplied
    if (!name || !role) {
      const { data: player } = await supabase
        .from('player_profiles')
        .select('full_name')
        .eq('user_id', userId)
        .maybeSingle();

      if (player) {
        name = name || player.full_name;
        role = role || 'player';
      } else {
        const { data: scout } = await supabase
          .from('scout_profiles')
          .select('full_name')
          .eq('user_id', userId)
          .maybeSingle();

        if (scout) {
          name = name || scout.full_name;
          role = role || 'scout';
        }
      }
    }

    await supabase.from('activity_logs').insert({
      user_id: userId,
      user_email: email || null,
      user_name: name || 'Unknown',
      user_role: role || 'unknown',
      action,
      details: details || null,
    });
  } catch (err) {
    // Logging must never break the app
    console.log('Activity log failed:', err);
  }
}

/** Check whether the signed-in user is an admin. */
export async function isAdmin(): Promise<boolean> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return false;

    const { data } = await supabase
      .from('admins')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    return !!data;
  } catch {
    return false;
  }
}