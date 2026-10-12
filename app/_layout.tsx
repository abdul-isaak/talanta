import { C } from '@/constants/ui'
import { AnalysisProvider } from '@/lib/analysis/AnalysisProvider'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

export default function RootLayout() {
  return (
    <AnalysisProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: C.bg },
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="login" />
        <Stack.Screen name="register-player" />
        <Stack.Screen name="register-scout" />
        <Stack.Screen name="player-dashboard" options={{ animation: 'fade' }} />
        <Stack.Screen name="player-profile" />
        <Stack.Screen name="edit-player-profile" />
        <Stack.Screen name="my-videos" />
        <Stack.Screen name="upload-video" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="edit-video" />
        <Stack.Screen name="scout-dashboard" options={{ animation: 'fade' }} />
        <Stack.Screen name="scout-search" />
        <Stack.Screen name="scout-shortlist" />
        <Stack.Screen name="scout-invitations" />
        <Stack.Screen name="player-profile-view" />
        <Stack.Screen name="analyze-video" />
        <Stack.Screen name="messages" />
        <Stack.Screen name="(main)" />
        <Stack.Screen name="admin-login" />
        <Stack.Screen name="admin-dashboard" />
        <Stack.Screen name="admin-report" />
      </Stack>
    </AnalysisProvider>
  )
}
