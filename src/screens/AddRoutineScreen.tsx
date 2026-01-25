import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { supabase } from '../api/supabaseClient';
import { useNavigation } from '@react-navigation/native';

const GROUPS = [
  { key: 'breath', name: 'Breath', color: '#4CC9FF' },
  { key: 'mind', name: 'Mind', color: '#3BE7D1' },
  { key: 'body', name: 'Body', color: '#8B7CFF' },
  { key: 'work', name: 'Work', color: '#2EA0FF' },
] as const;

type GroupKey = typeof GROUPS[number]['key'];

export default function AddRoutineScreen() {
  const navigation = useNavigation<any>();

  const [title, setTitle] = useState('');
  const [groupKey, setGroupKey] = useState<GroupKey>('breath');
  const [saving, setSaving] = useState(false);

  const canSave = useMemo(() => title.trim().length > 0 && !saving, [title, saving]);

  const save = async () => {
    const t = title.trim();
    if (!t) return;

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return Alert.alert('로그인이 필요해');

    setSaving(true);

    // sort_order 마지막 + 1
    const { data: lastData, error: lastErr } = await supabase
      .from('routines')
      .select('sort_order')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: false })
      .limit(1);

    if (lastErr) {
      setSaving(false);
      return Alert.alert('실패', lastErr.message);
    }

    const nextOrder = ((lastData as any)?.[0]?.sort_order ?? 0) + 1;

    const { error } = await supabase.from('routines').insert({
      user_id: user.id,
      title: t,
      sort_order: nextOrder,
      is_active: true,
      group_key: groupKey,
    });

    setSaving(false);

    if (error) return Alert.alert('실패', error.message);

    // 저장 성공 → 돌아가기
    navigation.goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0B0F14', paddingTop: 64, paddingHorizontal: 16 }}>
      <Text style={{ color: '#EAF2FF', fontSize: 24, fontWeight: '900' }}>Add Routine</Text>
      <Text style={{ color: '#8FA3B8', marginTop: 8, lineHeight: 20 }}>
        제목이 짧을수록 계속하기 쉬워.
      </Text>

      {/* Title */}
      <View style={{ marginTop: 16 }}>
        <Text style={{ color: '#EAF2FF', fontWeight: '900', marginBottom: 8 }}>제목</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="예: 5분 호흡 / 물 1컵 / 스트레칭"
          placeholderTextColor="#4A5A70"
          style={{
            backgroundColor: '#121A23',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#1E2A38',
            paddingHorizontal: 14,
            paddingVertical: 14,
            color: '#EAF2FF',
            fontSize: 15,
            fontWeight: '800',
          }}
        />
      </View>

      {/* Group */}
      <View style={{ marginTop: 16 }}>
        <Text style={{ color: '#EAF2FF', fontWeight: '900', marginBottom: 8 }}>태그</Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {GROUPS.map((g) => {
            const active = groupKey === g.key;
            return (
              <Pressable
                key={g.key}
                onPress={() => setGroupKey(g.key)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor: active ? 'rgba(76,201,255,0.12)' : '#0F151D',
                  borderWidth: 1,
                  borderColor: active ? g.color : '#1E2A38',
                }}
              >
                <Text style={{ color: active ? g.color : '#8FA3B8', fontWeight: '900' }}>
                  {g.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Bottom actions */}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 18 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={{
              width: 110,
              backgroundColor: '#121A23',
              borderWidth: 1,
              borderColor: '#1E2A38',
              paddingVertical: 14,
              borderRadius: 16,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#8FA3B8', fontWeight: '900' }}>취소</Text>
          </Pressable>

          <Pressable
            onPress={save}
            disabled={!canSave}
            style={{
              flex: 1,
              backgroundColor: canSave ? '#4CC9FF' : '#1A2330',
              paddingVertical: 14,
              borderRadius: 16,
              alignItems: 'center',
              opacity: canSave ? 1 : 0.7,
            }}
          >
            <Text style={{ color: canSave ? '#001018' : '#8FA3B8', fontWeight: '900', fontSize: 15 }}>
              {saving ? '저장 중…' : '저장'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
