import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../api/supabaseClient';

const BG = '#0B0F14';
const CARD = '#121A23';
const LINE = '#1E2A38';
const TEXT = '#EAF2FF';
const MUTED = '#8FA3B8';
const BLUE = '#4CC9FF';

export default function RoutineCreateScreen() {
  const navigation = useNavigation<any>();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const canSave = useMemo(() => title.trim().length >= 1, [title]);

  const save = async () => {
    const t = title.trim();
    if (!t || saving) return;

    setSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) {
        Alert.alert('로그인 필요', '다시 로그인해줘.');
        return;
      }

      // ✅ group_key 제거
      const payload = {
        user_id: user.id,
        title: t,
        is_active: true,
        sort_order: Date.now(),
      };

      const { error } = await supabase.from('routines').insert(payload as any);
      if (error) return Alert.alert('기록 추가 실패', error.message);

      Alert.alert('추가 완료', '대시보드에 반영됩니다.');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('기록 추가 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BG }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ flex: 1, paddingTop: 18, paddingHorizontal: 16 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 14,
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: LINE,
            }}
          >
            <Text style={{ color: MUTED, fontWeight: '900' }}>←</Text>
          </Pressable>

          <Text style={{ color: TEXT, fontSize: 16, fontWeight: '900' }}>기록 추가</Text>

          <View style={{ width: 44 }} />
        </View>

        {/* Card */}
        <View
          style={{
            marginTop: 14,
            backgroundColor: CARD,
            borderWidth: 1,
            borderColor: LINE,
            borderRadius: 18,
            padding: 14,
          }}
        >
          <Text style={{ color: MUTED, fontSize: 12, fontWeight: '800' }}>이름</Text>

          <TextInput
            ref={inputRef}
            value={title}
            onChangeText={setTitle}
            placeholder="예) 5분 호흡"
            placeholderTextColor="#536274"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={save}
            style={{
              color: TEXT,
              fontSize: 16,
              marginTop: 10,
              paddingVertical: 12,
              borderRadius: 14,
              backgroundColor: '#0E141C',
              borderWidth: 1,
              borderColor: LINE,
              paddingHorizontal: 12,
              fontWeight: '800',
            }}
          />

          <Text style={{ color: MUTED, fontSize: 12, marginTop: 10, lineHeight: 18 }}>
            짧게 한 줄. 대시보드에서 바로 체크할 수 있어.
          </Text>
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
          <Pressable
            onPress={() => navigation.goBack()}
            disabled={saving}
            style={{
              flex: 1,
              backgroundColor: '#0E141C',
              borderWidth: 1,
              borderColor: LINE,
              paddingVertical: 14,
              borderRadius: 16,
              alignItems: 'center',
              opacity: saving ? 0.7 : 1,
            }}
          >
            <Text style={{ color: MUTED, fontWeight: '900' }}>취소</Text>
          </Pressable>

          <Pressable
            onPress={save}
            disabled={!canSave || saving}
            style={{
              flex: 1,
              backgroundColor: canSave ? 'rgba(76,201,255,0.18)' : 'rgba(30,42,56,0.6)',
              borderWidth: 1,
              borderColor: canSave ? 'rgba(76,201,255,0.30)' : LINE,
              paddingVertical: 14,
              borderRadius: 16,
              alignItems: 'center',
              opacity: saving ? 0.85 : 1,
            }}
          >
            <Text style={{ color: canSave ? BLUE : MUTED, fontWeight: '900' }}>
              {saving ? '저장 중...' : '추가'}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
