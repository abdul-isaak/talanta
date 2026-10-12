import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'

export const supabaseUrl = 'https://zuzmfhagkihxrwkiqqsr.supabase.co'
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1em1maGFna2loeHJ3a2lxcXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1Mzk0OTMsImV4cCI6MjA5NzExNTQ5M30.qmm1i8L884HvMvazv-9ePJgSjunACZtbVEefJkjkswY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: Platform.OS !== 'web',
    detectSessionInUrl: Platform.OS === 'web',
  },
})