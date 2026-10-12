import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const GREEN = '#3BE097';
const NAVY = '#0d1b2a';
const CARD = '#132233';
const MUTED = '#7a99b0';

export default function EditPlayerProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [county, setCounty] = useState('');
  const [position, setPosition] = useState('');
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [preferredFoot, setPreferredFoot] = useState('');
  const [currentClub, setCurrentClub] = useState('');
  const [bio, setBio] = useState('');
  const [passAccuracy, setPassAccuracy] = useState('');
  const [goals, setGoals] = useState('');
  const [assists, setAssists] = useState('');
  const [appearances, setAppearances] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;

      const { data, error } = await supabase
        .from('player_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!error && data) {
        setFullName(data.full_name || '');
        setPhone(data.phone || '');
        setCounty(data.county || '');
        setPosition(data.position || '');
        setAge(data.age || '');
        setHeight(data.height || '');
        setWeight(data.weight || '');
        setPreferredFoot(data.preferred_foot || '');
        setCurrentClub(data.current_club || '');
        setBio(data.bio || '');
        setPassAccuracy(data.pass_accuracy || '');
        setGoals(String(data.goals || 0));
        setAssists(String(data.assists || 0));
        setAppearances(String(data.appearances || 0));
        setPhotoUrl(data.photo_url || '');
      }
    } catch (err) {
      console.log('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photos to upload a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string) => {
    setUploadingPhoto(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;

      const response = await fetch(uri);
      const blob = await response.blob();
      const fileExt = uri.split('.').pop() || 'jpg';
      const fileName = `${userId}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const arrayBuffer = await new Response(blob).arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, arrayBuffer, {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) {
        Alert.alert('Upload failed', uploadError.message);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setPhotoUrl(publicUrlData.publicUrl);

      // Save photo url to database immediately
      await supabase
        .from('player_profiles')
        .update({ photo_url: publicUrlData.publicUrl })
        .eq('user_id', userId);

      Alert.alert('Success', 'Profile photo updated!');

    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to upload image.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;

      const { error } = await supabase
        .from('player_profiles')
        .update({
          full_name: fullName,
          phone: phone,
          county: county,
          position: position,
          age: age,
          height: height,
          weight: weight,
          preferred_foot: preferredFoot,
          current_club: currentClub,
          bio: bio,
          pass_accuracy: passAccuracy,
          goals: parseInt(goals) || 0,
          assists: parseInt(assists) || 0,
          appearances: parseInt(appearances) || 0,
        })
        .eq('user_id', userId);

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert('Success! ✅', 'Profile updated successfully!', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      }
    } catch {
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || '??';
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <ProfileSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Player Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtn}>{saving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── Photo upload ── */}
          <View style={styles.photoSection}>
            <TouchableOpacity onPress={pickImage} disabled={uploadingPhoto}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.photoPreview} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Text style={styles.photoPlaceholderText}>{getInitials(fullName)}</Text>
                </View>
              )}
              <View style={styles.photoEditBadge}>
                {uploadingPhoto
                  ? <ActivityIndicator size="small" color={NAVY} />
                  : <Text style={styles.photoEditBadgeText}>📷</Text>
                }
              </View>
            </TouchableOpacity>
            <Text style={styles.photoHint}>Tap to change photo</Text>
          </View>

          <Text style={styles.sectionTitle}>Personal info</Text>
          <View style={styles.field}><Text style={styles.label}>Full name</Text><TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholderTextColor="#4a6070" placeholder="Your full name" /></View>
          <View style={styles.field}><Text style={styles.label}>Phone number</Text><TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholderTextColor="#4a6070" placeholder="07XX XXX XXX" keyboardType="phone-pad" /></View>
          <View style={styles.field}><Text style={styles.label}>County</Text><TextInput style={styles.input} value={county} onChangeText={setCounty} placeholderTextColor="#4a6070" placeholder="e.g. Nairobi" /></View>
          <View style={styles.field}><Text style={styles.label}>Age</Text><TextInput style={styles.input} value={age} onChangeText={setAge} placeholderTextColor="#4a6070" placeholder="e.g. 21" keyboardType="numeric" /></View>
          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}><Text style={styles.label}>Height (cm)</Text><TextInput style={styles.input} value={height} onChangeText={setHeight} placeholderTextColor="#4a6070" placeholder="e.g. 178" keyboardType="numeric" /></View>
            <View style={{ width: 12 }} />
            <View style={[styles.field, { flex: 1 }]}><Text style={styles.label}>Weight (kg)</Text><TextInput style={styles.input} value={weight} onChangeText={setWeight} placeholderTextColor="#4a6070" placeholder="e.g. 73" keyboardType="numeric" /></View>
          </View>

          <Text style={styles.sectionTitle}>Football info</Text>
          <View style={styles.field}><Text style={styles.label}>Position</Text><TextInput style={styles.input} value={position} onChangeText={setPosition} placeholderTextColor="#4a6070" placeholder="e.g. Striker" /></View>
          <View style={styles.field}><Text style={styles.label}>Preferred foot</Text><TextInput style={styles.input} value={preferredFoot} onChangeText={setPreferredFoot} placeholderTextColor="#4a6070" placeholder="Left / Right / Both" /></View>
          <View style={styles.field}><Text style={styles.label}>Current club</Text><TextInput style={styles.input} value={currentClub} onChangeText={setCurrentClub} placeholderTextColor="#4a6070" placeholder="e.g. Gor Mahia FC" /></View>

          <Text style={styles.sectionTitle}>Season stats</Text>
          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}><Text style={styles.label}>Goals</Text><TextInput style={styles.input} value={goals} onChangeText={setGoals} placeholderTextColor="#4a6070" placeholder="0" keyboardType="numeric" /></View>
            <View style={{ width: 12 }} />
            <View style={[styles.field, { flex: 1 }]}><Text style={styles.label}>Assists</Text><TextInput style={styles.input} value={assists} onChangeText={setAssists} placeholderTextColor="#4a6070" placeholder="0" keyboardType="numeric" /></View>
          </View>
          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}><Text style={styles.label}>Appearances</Text><TextInput style={styles.input} value={appearances} onChangeText={setAppearances} placeholderTextColor="#4a6070" placeholder="0" keyboardType="numeric" /></View>
            <View style={{ width: 12 }} />
            <View style={[styles.field, { flex: 1 }]}><Text style={styles.label}>Pass accuracy %</Text><TextInput style={styles.input} value={passAccuracy} onChangeText={setPassAccuracy} placeholderTextColor="#4a6070" placeholder="e.g. 84%" /></View>
          </View>

          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.field}>
            <Text style={styles.label}>Bio</Text>
            <TextInput style={[styles.input, { height: 100, textAlignVertical: 'top', paddingTop: 12 }]} value={bio} onChangeText={setBio} placeholderTextColor="#4a6070" placeholder="Tell scouts about yourself..." multiline />
          </View>

          <TouchableOpacity style={[styles.saveMainBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={NAVY} /> : <Text style={styles.saveMainBtnText}>Save profile</Text>}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e3448' },
  backBtn: { color: GREEN, fontSize: 14, fontWeight: '600', width: 60 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  saveBtn: { color: GREEN, fontSize: 14, fontWeight: '700', width: 60, textAlign: 'right' },

  photoSection: { alignItems: 'center', marginTop: 24, marginBottom: 10 },
  photoPreview: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: GREEN },
  photoPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: CARD, borderWidth: 3, borderColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  photoPlaceholderText: { color: GREEN, fontSize: 28, fontWeight: '800' },
  photoEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: NAVY },
  photoEditBadgeText: { fontSize: 14 },
  photoHint: { color: MUTED, fontSize: 12, marginTop: 10 },

  sectionTitle: { fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 14 },
  field: { marginBottom: 14 },
  label: { fontSize: 12, color: MUTED, fontWeight: '500', marginBottom: 6 },
  input: { backgroundColor: CARD, color: '#fff', fontSize: 14, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#1e3448' },
  row: { flexDirection: 'row' },
  saveMainBtn: { backgroundColor: GREEN, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
  saveMainBtnText: { color: NAVY, fontSize: 15, fontWeight: '700' },
});