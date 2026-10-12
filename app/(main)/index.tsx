import { StyleSheet, Text, View } from 'react-native'

export default function TabHomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Home Tab</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a2540',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#ffffff',
    fontSize: 18,
  },
})