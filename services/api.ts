import AsyncStorage from '@react-native-async-storage/async-storage'
import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
})

// Attach token to every request automatically
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api