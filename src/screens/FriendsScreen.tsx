import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import dayjs from 'dayjs';
import { supabase } from '../api/supabaseClient';

type Profile = {
  user_id: string;
  display_name: string | null;
  invite_code: string | null;
};

type FriendLink = {
  user_id: string;
  friend_user_id: string;
};

type DailyLog = {
  user_id: string;
  date_key: string;
  routine_id: string | null;
  status: 'done' | 'rest';
};

type Cheer = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  message: string;
  created_at: string;
};

type RoutineRow = {
  id: string;
};

const CARD = '#121A23';
const LINE = '#1E2A38';
const MUTED = '#8FA3B8';
const TEXT = '#EAF2FF';
const BLUE = '#4CC9FF';

function Card({ title, desc, children }: any) {
  return (
    <View
      style={{
        backgroundColor: CARD,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: LINE,
        padding: 14,
        marginTop: 12,
      }}
    >
      <Text style={{ color: TEXT, fontSize: 15, fontWeight: '900' }}>{title}</Text>
      {desc ? <Text style={{ color: MUTED, marginTop: 6, lineHeight: 20 }}>{desc}</Text> : null}
      <View style={{ marginTop: 12 }}>{children}</View>
    </View>
  );
}

export default function FriendsScreen() {
  const todayKey = dayjs().format('YYYY-MM-DD');

  const [me, setMe] = useState<Profile | null>(null);
  const [myNameDraft, setMyNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [friends, setFriends] = useState<Profile[]>([]);
  const [friendLogsToday, setFriendLogsToday] = useState<DailyLog[]>([]);
  const [inviteInput, setInviteInput] = useState('');

  const [cheersIn, setCheersIn] = useState<Cheer[]>([]);
  const [senderNameMap, setSenderNameMap] = useState<Map<string, string>>(new Map());
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const [customCheer, setCustomCheer] = useState('');

  const [myActiveCount, setMyActiveCount] = useState(0);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [blockedProfiles, setBlockedProfiles] = useState<Profile[]>([]);

  const load = async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    // 내 프로필
    const { data: myP, error: myErr } = await supabase
      .from('user_profiles')
      .select('user_id,display_name,invite_code')
      .eq('user_id', user.id)
      .maybeSingle();

    if (myErr) return Alert.alert('실패', myErr.message);
    setMe((myP as any) || null);
    setMyNameDraft(((myP as any)?.display_name ?? '') as string);

    // 내 활성 기록 수(%) 계산용
    const { count: rCount } = await supabase
      .from('routines')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true);

    setMyActiveCount(rCount ?? 0);

    // 차단 목록
    const { data: b, error: bErr } = await supabase
      .from('blocked_users')
      .select('blocked_user_id')
      .eq('user_id', user.id);

    if (!bErr) {
      const ids = ((b as any) || []).map((x: any) => x.blocked_user_id);
      setBlockedIds(ids);

      if (ids.length > 0) {
        const { data: bp } = await supabase
          .from('user_profiles')
          .select('user_id,display_name,invite_code')
          .in('user_id', ids);
        setBlockedProfiles(((bp as any) || []) as Profile[]);
      } else {
        setBlockedProfiles([]);
      }
    }

    // 친구 링크(양방향 조회)
    const { data: links, error: linkErr } = await supabase
      .from('friend_links')
      .select('user_id,friend_user_id')
      .or(`user_id.eq.${user.id},friend_user_id.eq.${user.id}`);

    if (linkErr) return Alert.alert('실패', linkErr.message);

    const ids = new Set<string>();
    for (const row of (links as any as FriendLink[]) || []) {
      const other = row.user_id === user.id ? row.friend_user_id : row.user_id;
      if (blockedIds.includes(other)) continue;
      ids.add(other);
    }
    const friendIds = Array.from(ids);

    // 친구 프로필
    if (friendIds.length > 0) {
      const { data: fps, error: fpErr } = await supabase
        .from('user_profiles')
        .select('user_id,display_name,invite_code')
        .in('user_id', friendIds);

      if (fpErr) return Alert.alert('실패', fpErr.message);
      setFriends(((fps as any) || []) as Profile[]);

      // 친구 오늘 기록
      const { data: logs, error: logErr } = await supabase
        .from('daily_logs')
        .select('user_id,date_key,routine_id,status')
        .eq('date_key', todayKey)
        .in('user_id', friendIds);

      if (logErr) return Alert.alert('실패', logErr.message);
      setFriendLogsToday((logs as any) || []);
    } else {
      setFriends([]);
      setFriendLogsToday([]);
    }

    // 받은 응원(최근 20)
    const { data: cin, error: cErr } = await supabase
      .from('cheers')
      .select('id,from_user_id,to_user_id,message,created_at')
      .eq('to_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (cErr) return Alert.alert('실패', cErr.message);
    const cinRows = ((cin as any) || []) as Cheer[];
    setCheersIn(cinRows);

    // 보낸 사람 이름 매핑
    const senderIds = Array.from(new Set(cinRows.map((c) => c.from_user_id)));
    if (senderIds.length > 0) {
      const { data: sp } = await supabase
        .from('user_profiles')
        .select('user_id,display_name')
        .in('user_id', senderIds);

      const m = new Map<string, string>();
      for (const row of (sp as any) || []) m.set(row.user_id, row.display_name ?? 'Friend');
      setSenderNameMap(m);
    } else {
      setSenderNameMap(new Map());
    }
  };

  useEffect(() => {
    load();
  }, []);

  const statusMap = useMemo(() => {
    const map = new Map<string, { rest: boolean; doneCount: number }>();
    for (const f of friends) map.set(f.user_id, { rest: false, doneCount: 0 });

    for (const row of friendLogsToday) {
      const st = map.get(row.user_id) ?? { rest: false, doneCount: 0 };
      if (row.status === 'rest' && !row.routine_id) st.rest = true;
      if (row.status === 'done' && row.routine_id) st.doneCount += 1;
      map.set(row.user_id, st);
    }

    return map;
  }, [friends, friendLogsToday]);

  const copyCode = async () => {
    if (!me?.invite_code) return;
    await Clipboard.setStringAsync(me.invite_code);
    Alert.alert('복사됨', `초대코드 ${me.invite_code}`);
  };

  const addFriendByCode = async () => {
    const code = inviteInput.trim().toUpperCase();
    if (!code) return;

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const { data: target, error: tErr } = await supabase
      .from('user_profiles')
      .select('user_id,display_name,invite_code')
      .eq('invite_code', code)
      .maybeSingle();

    if (tErr) return Alert.alert('실패', tErr.message);
    if (!target) return Alert.alert('없음', '해당 초대코드를 찾지 못했어.');
    if (target.user_id === user.id) return Alert.alert('불가', '내 코드는 추가할 수 없어.');
    if (blockedIds.includes(target.user_id)) return Alert.alert('불가', '차단된 사용자야.');

    const { error: iErr } = await supabase.from('friend_links').insert({
      user_id: user.id,
      friend_user_id: target.user_id,
    });

    if (iErr) {
      if (iErr.message?.toLowerCase().includes('duplicate')) return Alert.alert('이미 친구', '이미 추가된 친구야.');
      return Alert.alert('실패', iErr.message);
    }

    setInviteInput('');
    load();
  };

  const sendCheer = async (toUserId: string, message: string) => {
    const preset = message.trim();
    if (!preset) return;

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    setSendingTo(toUserId);

    const { error } = await supabase.from('cheers').insert({
      from_user_id: user.id,
      to_user_id: toUserId,
      message: preset,
    });

    setSendingTo(null);

    if (error) return Alert.alert('실패', error.message);
    Alert.alert('보냄', '응원 보냈어.');
    setCustomCheer('');
    load();
  };

  const saveMyName = async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const name = myNameDraft.trim();
    setSavingName(true);
    const { error } = await supabase
      .from('user_profiles')
      .update({ display_name: name ? name : null })
      .eq('user_id', user.id);
    setSavingName(false);

    if (error) return Alert.alert('실패', error.message);
    load();
  };

  const removeFriend = async (friendUserId: string) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const { error } = await supabase
      .from('friend_links')
      .delete()
      .or(`and(user_id.eq.${user.id},friend_user_id.eq.${friendUserId}),and(user_id.eq.${friendUserId},friend_user_id.eq.${user.id})`);

    if (error) return Alert.alert('실패', error.message);
    load();
  };

  const blockUser = async (friendUserId: string) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const { error } = await supabase.from('blocked_users').insert({
      user_id: user.id,
      blocked_user_id: friendUserId,
    });

    if (error && !String(error.message).toLowerCase().includes('duplicate')) {
      return Alert.alert('실패', error.message);
    }

    // 친구면 링크도 제거
    await supabase
      .from('friend_links')
      .delete()
      .or(`and(user_id.eq.${user.id},friend_user_id.eq.${friendUserId}),and(user_id.eq.${friendUserId},friend_user_id.eq.${user.id})`);

    load();
  };

  const unblockUser = async (uid: string) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('user_id', user.id)
      .eq('blocked_user_id', uid);

    if (error) return Alert.alert('실패', error.message);
    load();
  };

  const senderName = (uid: string) => senderNameMap.get(uid) ?? 'Friend';

  const friendPercent = (doneCount: number) => {
    if (myActiveCount <= 0) return 0;
    return Math.round((doneCount / myActiveCount) * 100);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0B0F14' }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 18 }}>
      <Card title="내 초대코드" desc="친구에게 코드만 던져. 연결은 가볍게.">
        <View
          style={{
            backgroundColor: '#0F151D',
            borderWidth: 1,
            borderColor: '#1E2A38',
            borderRadius: 14,
            paddingVertical: 12,
            paddingHorizontal: 12,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#EAF2FF', fontWeight: '900', fontSize: 16 }}>
            {me?.invite_code ?? '—'}
          </Text>
          <Pressable
            onPress={copyCode}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: 'rgba(76,201,255,0.12)',
              borderWidth: 1,
              borderColor: 'rgba(76,201,255,0.25)',
            }}
          >
            <Text style={{ color: '#4CC9FF', fontWeight: '900' }}>복사</Text>
          </Pressable>
        </View>
      </Card>

      <Card title="내 닉네임" desc="친구 화면에 보여줄 이름">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput
            value={myNameDraft}
            onChangeText={setMyNameDraft}
            placeholder="예: Jungmo"
            placeholderTextColor="#4A5A70"
            style={{
              flex: 1,
              backgroundColor: '#0F151D',
              borderWidth: 1,
              borderColor: '#1E2A38',
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 12,
              color: '#EAF2FF',
              fontWeight: '900',
            }}
          />
          <Pressable
            onPress={saveMyName}
            disabled={savingName}
            style={{
              width: 90,
              backgroundColor: 'rgba(76,201,255,0.16)',
              borderWidth: 1,
              borderColor: 'rgba(76,201,255,0.25)',
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: savingName ? 0.7 : 1,
            }}
          >
            <Text style={{ color: '#4CC9FF', fontWeight: '900' }}>{savingName ? '저장…' : '저장'}</Text>
          </Pressable>
        </View>
      </Card>

      <Card title="친구 추가" desc="상대 초대코드를 입력해.">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput
            value={inviteInput}
            onChangeText={setInviteInput}
            placeholder="예: A1B2C3D4"
            placeholderTextColor="#4A5A70"
            autoCapitalize="characters"
            style={{
              flex: 1,
              backgroundColor: '#0F151D',
              borderWidth: 1,
              borderColor: '#1E2A38',
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 12,
              color: '#EAF2FF',
              fontWeight: '900',
            }}
          />
          <Pressable
            onPress={addFriendByCode}
            style={{
              width: 90,
              backgroundColor: '#4CC9FF',
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#001018', fontWeight: '900' }}>추가</Text>
          </Pressable>
        </View>
      </Card>

      <Card title="친구" desc={`${dayjs().format('M/D')} 기준 (개수 + %)`}>
        {friends.length === 0 ? (
          <Text style={{ color: '#8FA3B8' }}>아직 친구가 없어.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {friends.map((f) => {
              const st = statusMap.get(f.user_id) ?? { rest: false, doneCount: 0 };
              const pct = friendPercent(st.doneCount);
              const label = st.rest ? '쉬기' : st.doneCount > 0 ? `완료 ${st.doneCount} · ${pct}%` : '기록 없음';

              return (
                <View
                  key={f.user_id}
                  style={{
                    backgroundColor: '#0F151D',
                    borderWidth: 1,
                    borderColor: '#1E2A38',
                    borderRadius: 16,
                    padding: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#EAF2FF', fontWeight: '900' }}>
                        {f.display_name ?? f.invite_code ?? 'Friend'}
                      </Text>
                      <Text style={{ color: '#8FA3B8', marginTop: 4, fontSize: 12 }}>
                        {label}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => sendCheer(f.user_id, customCheer || '오늘은 1개면 충분해.')}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 999,
                        backgroundColor: 'rgba(76,201,255,0.12)',
                        borderWidth: 1,
                        borderColor: 'rgba(76,201,255,0.25)',
                        opacity: sendingTo === f.user_id ? 0.6 : 1,
                      }}
                      disabled={sendingTo === f.user_id}
                    >
                      <Text style={{ color: '#4CC9FF', fontWeight: '900' }}>
                        {sendingTo === f.user_id ? '보내는 중…' : '응원'}
                      </Text>
                    </Pressable>
                  </View>

                  {/* 커스텀 응원 */}
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    <TextInput
                      value={customCheer}
                      onChangeText={setCustomCheer}
                      placeholder="커스텀 응원 입력"
                      placeholderTextColor="#4A5A70"
                      style={{
                        flex: 1,
                        backgroundColor: '#121A23',
                        borderWidth: 1,
                        borderColor: '#1E2A38',
                        borderRadius: 14,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        color: '#EAF2FF',
                        fontWeight: '900',
                      }}
                    />
                    <Pressable
                      onPress={() => sendCheer(f.user_id, customCheer)}
                      style={{
                        width: 86,
                        borderRadius: 14,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#0E141C',
                        borderWidth: 1,
                        borderColor: '#1E2A38',
                      }}
                    >
                      <Text style={{ color: '#8FA3B8', fontWeight: '900' }}>전송</Text>
                    </Pressable>
                  </View>

                  {/* 위험 액션 */}
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    <Pressable
                      onPress={() =>
                        Alert.alert('친구 삭제', '정말 삭제할래?', [
                          { text: '취소', style: 'cancel' },
                          { text: '삭제', style: 'destructive', onPress: () => removeFriend(f.user_id) },
                        ])
                      }
                      style={{
                        flex: 1,
                        borderRadius: 14,
                        paddingVertical: 10,
                        alignItems: 'center',
                        backgroundColor: '#0E141C',
                        borderWidth: 1,
                        borderColor: '#1E2A38',
                      }}
                    >
                      <Text style={{ color: '#8FA3B8', fontWeight: '900' }}>삭제</Text>
                    </Pressable>

                    <Pressable
                      onPress={() =>
                        Alert.alert('차단', '차단하면 친구에서 사라지고, 다시 보려면 차단 해제해야 해.', [
                          { text: '취소', style: 'cancel' },
                          { text: '차단', style: 'destructive', onPress: () => blockUser(f.user_id) },
                        ])
                      }
                      style={{
                        flex: 1,
                        borderRadius: 14,
                        paddingVertical: 10,
                        alignItems: 'center',
                        backgroundColor: 'rgba(255,107,107,0.10)',
                        borderWidth: 1,
                        borderColor: 'rgba(255,107,107,0.25)',
                      }}
                    >
                      <Text style={{ color: '#FF6B6B', fontWeight: '900' }}>차단</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      <Card title="차단 목록" desc="닉네임으로 표시">
        {blockedProfiles.length === 0 ? (
          <Text style={{ color: MUTED }}>차단한 사용자가 없어.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {blockedProfiles.map((p) => (
              <View
                key={p.user_id}
                style={{
                  backgroundColor: '#0F151D',
                  borderWidth: 1,
                  borderColor: '#1E2A38',
                  borderRadius: 16,
                  padding: 12,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: TEXT, fontWeight: '900' }}>{p.display_name ?? p.invite_code ?? 'User'}</Text>
                <Pressable
                  onPress={() => unblockUser(p.user_id)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    backgroundColor: '#0E141C',
                    borderWidth: 1,
                    borderColor: '#1E2A38',
                  }}
                >
                  <Text style={{ color: MUTED, fontWeight: '900' }}>해제</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card title="받은 응원" desc="최근 10개">
        {cheersIn.length === 0 ? (
          <Text style={{ color: '#8FA3B8' }}>아직 받은 응원이 없어.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {cheersIn.slice(0, 10).map((c) => (
              <View
                key={c.id}
                style={{
                  backgroundColor: 'rgba(76,201,255,0.10)',
                  borderWidth: 1,
                  borderColor: 'rgba(76,201,255,0.20)',
                  borderRadius: 16,
                  padding: 12,
                }}
              >
                <Text style={{ color: '#8FA3B8', fontSize: 12, fontWeight: '900' }}>
                  From · {senderName(c.from_user_id)}
                </Text>
                <Text style={{ color: '#EAF2FF', fontWeight: '900', marginTop: 6 }}>{c.message}</Text>
                <Text style={{ color: '#8FA3B8', marginTop: 6, fontSize: 12 }}>
                  {dayjs(c.created_at).format('M/D HH:mm')}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </ScrollView>
  );
}
