import { ListSkeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
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

export default function MessagesScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [activeChatName, setActiveChatName] = useState('');
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const init = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    setCurrentUserId(userId || null);
    if (userId) {
      await fetchConversations(userId);
      await fetchAllUsers(userId);
    }
    setLoading(false);
  };

  const fetchAllUsers = async (userId: string) => {
    const { data: players } = await supabase.from('player_profiles').select('user_id, full_name');
    const { data: scouts } = await supabase.from('scout_profiles').select('user_id, full_name');

    const combined = [
      ...(players || []).map((p: any) => ({ id: p.user_id, name: p.full_name, type: 'Player' })),
      ...(scouts || []).map((s: any) => ({ id: s.user_id, name: s.full_name, type: 'Scout' })),
    ].filter((u: any) => u.id !== userId);

    setAllUsers(combined);
  };

  const fetchConversations = async (userId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const grouped: Record<string, any> = {};
      data.forEach((msg: any) => {
        const otherId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
        if (!grouped[otherId]) {
          grouped[otherId] = {
            otherId,
            lastMsg: msg.content,
            time: msg.created_at,
            name: 'Unknown',
          };
        }
      });

      const { data: players } = await supabase.from('player_profiles').select('user_id, full_name');
      const { data: scouts } = await supabase.from('scout_profiles').select('user_id, full_name');

      const nameMap: Record<string, string> = {};
      (players || []).forEach((p: any) => { nameMap[p.user_id] = p.full_name; });
      (scouts || []).forEach((s: any) => { nameMap[s.user_id] = s.full_name; });

      Object.values(grouped).forEach((conv: any) => {
        conv.name = nameMap[conv.otherId] || 'Unknown User';
      });

      setConversations(Object.values(grouped));
    }
  };

  const openChat = async (otherId: string, otherName: string) => {
    setActiveChat(otherId);
    setActiveChatName(otherName);
    setShowNewChat(false);
    if (!currentUserId) return;

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${currentUserId})`)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setChatMessages(data);
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || !currentUserId || !activeChat) return;

    const textToSend = message;
    setMessage('');

    const { error } = await supabase
      .from('messages')
      .insert({
        sender_id: currentUserId,
        receiver_id: activeChat,
        content: textToSend,
      });

    if (!error) {
      setChatMessages(prev => [...prev, {
        sender_id: currentUserId,
        content: textToSend,
        created_at: new Date().toISOString(),
      }]);
      fetchConversations(currentUserId);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <ListSkeleton />
      </SafeAreaView>
    );
  }

  // ── Chat view ──
  if (activeChat) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <View style={styles.chatHeader}>
            <TouchableOpacity onPress={() => setActiveChat(null)}>
              <Text style={styles.backBtn}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.chatName}>{activeChatName}</Text>
          </View>

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.chatScroll}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
            {chatMessages.length === 0 ? (
              <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
            ) : (
              chatMessages.map((m, i) => (
                <View key={i} style={[styles.msgRow, m.sender_id === currentUserId && styles.msgRowMe]}>
                  <View style={[styles.msgBubble, m.sender_id === currentUserId ? styles.msgBubbleMe : styles.msgBubbleThem]}>
                    <Text style={[styles.msgText, m.sender_id === currentUserId && styles.msgTextMe]}>{m.content}</Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.msgInput}
              placeholder="Type a message..."
              placeholderTextColor="#4a6070"
              value={message}
              onChangeText={setMessage}
              multiline
              onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
              <Text style={styles.sendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── New chat selection ──
  if (showNewChat) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={() => setShowNewChat(false)}>
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.chatName}>New Message</Text>
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          {allUsers.length === 0 ? (
            <Text style={styles.emptyText}>No other users registered yet.</Text>
          ) : (
            allUsers.map((u, i) => (
              <TouchableOpacity
                key={i}
                style={styles.convRow}
                onPress={() => openChat(u.id, u.name)}
              >
                <View style={styles.convAvatar}>
                  <Text style={styles.convAvatarText}>{u.name?.[0]?.toUpperCase() || '?'}</Text>
                </View>
                <View style={styles.convInfo}>
                  <Text style={styles.convName}>{u.name || 'Unknown'}</Text>
                  <Text style={styles.convType}>{u.type}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Conversation list ──
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.navbar}>
        <Text style={styles.navLogo}>Talan<Text style={styles.navLogoGreen}>ta</Text></Text>
        <Text style={styles.navTitle}>Messages</Text>
        <TouchableOpacity onPress={() => setShowNewChat(true)}>
          <Text style={styles.newChatBtn}>+ New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {conversations.length === 0 ? (
          <View>
            <Text style={styles.emptyText}>No conversations yet.</Text>
            <TouchableOpacity style={styles.startBtn} onPress={() => setShowNewChat(true)}>
              <Text style={styles.startBtnText}>Start a conversation</Text>
            </TouchableOpacity>
          </View>
        ) : (
          conversations.map((c, i) => (
            <TouchableOpacity
              key={i}
              style={styles.convRow}
              onPress={() => openChat(c.otherId, c.name)}
            >
              <View style={styles.convAvatar}>
                <Text style={styles.convAvatarText}>{c.name?.[0]?.toUpperCase() || '?'}</Text>
              </View>
              <View style={styles.convInfo}>
                <Text style={styles.convName}>{c.name}</Text>
                <Text style={styles.convLastMsg} numberOfLines={1}>{c.lastMsg}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => router.back()}>
          <Text style={styles.tabIcon}>🏠</Text>
          <Text style={styles.tabLabel}>Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  scroll: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 100, paddingTop: 16 },
  navbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e3448' },
  navLogo: { fontSize: 22, fontWeight: '800', color: '#fff', minWidth: 90 },
  navLogoGreen: { color: GREEN },
  navTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  newChatBtn: { color: GREEN, fontSize: 14, fontWeight: '700' },
  emptyText: { color: MUTED, fontSize: 14, textAlign: 'center', marginTop: 40, marginBottom: 16 },
  startBtn: { backgroundColor: GREEN, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginHorizontal: 20 },
  startBtnText: { color: NAVY, fontSize: 14, fontWeight: '700' },
  convRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#1e3448' },
  convAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1e3448', alignItems: 'center', justifyContent: 'center' },
  convAvatarText: { color: GREEN, fontSize: 14, fontWeight: '700' },
  convInfo: { flex: 1 },
  convName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  convType: { fontSize: 12, color: MUTED, marginTop: 2 },
  convLastMsg: { fontSize: 13, color: MUTED, marginTop: 2 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e3448' },
  backBtn: { color: GREEN, fontSize: 14, fontWeight: '600' },
  chatName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  chatScroll: { flexGrow: 1, padding: 16, paddingBottom: 8 },
  msgRow: { marginBottom: 12, alignItems: 'flex-start' },
  msgRowMe: { alignItems: 'flex-end' },
  msgBubble: { maxWidth: '80%', borderRadius: 16, padding: 12 },
  msgBubbleThem: { backgroundColor: CARD, borderBottomLeftRadius: 4 },
  msgBubbleMe: { backgroundColor: GREEN, borderBottomRightRadius: 4 },
  msgText: { fontSize: 14, color: '#fff', lineHeight: 20 },
  msgTextMe: { color: NAVY },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#1e3448', backgroundColor: NAVY },
  msgInput: { flex: 1, backgroundColor: CARD, color: '#fff', fontSize: 14, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#1e3448', maxHeight: 100 },
  sendBtn: { backgroundColor: GREEN, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  sendBtnText: { color: NAVY, fontSize: 14, fontWeight: '700' },
  tabBar: { flexDirection: 'row', backgroundColor: '#071d33', borderTopWidth: 1, borderTopColor: '#1e3448', paddingVertical: 10, paddingHorizontal: 16 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 20, marginBottom: 3 },
  tabLabel: { fontSize: 10, color: MUTED },
})