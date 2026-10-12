import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useContext, useEffect, useState } from 'react'

// Define the shape of the user object
type User = {
  id: string
  name: string
  email: string
  role: 'player' | 'scout'
}

// Define what the context provides
type AuthContextType = {
  user: User | null
  loading: boolean
  login: (userData: User, token: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadUser()
  }, [])

  const loadUser = async () => {
    try {
      const token = await AsyncStorage.getItem('token')
      const savedUser = await AsyncStorage.getItem('user')
      if (token && savedUser) {
        setUser(JSON.parse(savedUser))
      }
    } catch (error) {
      console.log('Error loading user:', error)
    } finally {
      setLoading(false)
    }
  }

  const login = async (userData: User, token: string) => {
    await AsyncStorage.setItem('token', token)
    await AsyncStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
  }

  const logout = async () => {
    await AsyncStorage.removeItem('token')
    await AsyncStorage.removeItem('user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}