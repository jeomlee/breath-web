// src/screens/ConnectSharedScreen.tsx
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text as RNText,
  ScrollView,
  Pressable,
  TextInput as RNTextInput,
  Alert,
  RefreshControl,
  type TextProps,
  type TextInputProps,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ConnectStackParamList } from '../navigation/types';
import { fetchMySharedRooms, findRoomByCode, joinRoom, type SharedRoom } from '../api/sharedRoutines';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenContainer from '../components/ScreenContainer';

/* =========================
   ✅ Text / TextInput wrapper
   - 시스템 폰트 스케일 차단
========================= */
function T(props: TextProps) {
  return <RNText {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}
function TI(props: TextInputProps) {
  return <RNTextInput {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}

/* =========================
   Colors
========================= */
const BG = '#0B0F14';
const CARD = '#121A23';
const LINE = '#1E2A38';
const MUTED = '#8FA3B8';
const TEXT = '#EAF2FF';
const BLUE = '#4CC9FF';

/* =========================
   Card Component (유지)
========================= */
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
      <T style={{ color: TEXT, fontSize: 15, fontWeight: '900' }}>{title}</T>
      {desc ? <T style={{ color: MUTED, marginTop: 6, lineHeight: 20 }}>{desc}</T> : null}
      <View style={{ marginTop: 12 }}>{children}</View>
    </View>
  );
}

export default function ConnectSharedScreen() {
  const nav = useNavigation<NativeStackNavigationProp<ConnectStackParamList>>();
  const insets = useSafeAreaInsets();

  const [rooms, setRooms] = useState<SharedRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  // ✅ 다른 화면들과 통일: 상단 여백을 안전영역 기준으로 "적당히"
const topPad = useMemo(
  () => Math.min(Math.max(insets.top, 8), 18),
  [insets.top]
);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rs = await fetchMySharedRooms();
      setRooms(rs);
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '불러오기에 실패하였습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const goShareCreate = () => nav.navigate('ShareRoutineCreate');
  const goBoard = (roomId: string, routineTitle?: string) =>
    nav.navigate('SharedRoutineBoard', { roomId, routineTitle });

  const joinByCode = useCallback(async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return Alert.alert('안내', '참여 코드를 입력해 주세요.');

    try {
      const room = await findRoomByCode(code);
      if (!room) return Alert.alert('안내', '해당 코드의 공유 루틴을 찾지 못했습니다.');
      if (room.is_active === false) return Alert.alert('안내', '현재 비활성화된 공유 루틴입니다.');

      await joinRoom(room.id);
      setJoinCode('');
      await load();
      goBoard(room.id, undefined);
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '참여에 실패하였습니다.');
    }
  }, [joinCode, load, nav]);

  const H = 46;

  return (
    <ScreenContainer bg={BG} barStyle="light-content">
      <ScrollView
        style={{ flex: 1, backgroundColor: BG }}
        contentContainerStyle={{
          // ✅ 여기 한 줄이 "좌우 여백" 해결의 핵심
          paddingHorizontal: 16,
          // ✅ 상단 여백은 안전영역 기반으로
          paddingTop: topPad,
          paddingBottom: 18,
        }}
        refreshControl={<RefreshControl tintColor={BLUE} refreshing={loading} onRefresh={load} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 헤더 */}
        <View>
          <T style={{ color: TEXT, fontSize: 26, fontWeight: '900' }}>함께하기</T>
          <T style={{ color: MUTED, marginTop: 6, lineHeight: 20 }}>
            참여 중인 공유 루틴이 여기에 표시됩니다.
          </T>
        </View>

        {/* 빠른 시작 */}
        <Card title="빠른 시작" desc="내 루틴을 공유하거나, 코드로 바로 참여할 수 있어요.">
          {/* 내 루틴 공유 */}
          <Pressable
            onPress={goShareCreate}
            style={{
              backgroundColor: 'rgba(76,201,255,0.16)',
              borderWidth: 1,
              borderColor: 'rgba(76,201,255,0.25)',
              borderRadius: 14,
              height: H,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <T style={{ color: BLUE, fontWeight: '900' }}>내 루틴 공유하기</T>
          </Pressable>

          {/* 참여 코드 */}
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 10 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: '#0F151D',
                borderWidth: 1,
                borderColor: LINE,
                borderRadius: 14,
                height: H,
                paddingHorizontal: 12,
                justifyContent: 'center',
              }}
            >
              <TI
                value={joinCode}
                onChangeText={setJoinCode}
                placeholder="참여 코드 (예: VA844CAZ)"
                placeholderTextColor="#4A5A70"
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={joinByCode}
                style={{
                  color: TEXT,
                  fontWeight: '900',
                  letterSpacing: 1,
                  paddingVertical: 0,
                }}
              />
            </View>

            <Pressable
              onPress={joinByCode}
              disabled={loading}
              style={{
                width: 104,
                height: H,
                backgroundColor: BLUE,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: loading ? 0.7 : 1,
              }}
            >
              <T style={{ color: '#001018', fontWeight: '900' }}>참여하기</T>
            </Pressable>
          </View>

          <T style={{ color: MUTED, marginTop: 10, fontSize: 12, lineHeight: 18 }}>
            코드를 입력하고 “참여하기”를 누르면 보드로 이동합니다.
          </T>
        </Card>

        {/* 참여 중인 루틴 */}
        <Card title="참여 중인 공유 루틴" desc="카드를 눌러 보드로 이동하실 수 있습니다.">
          {rooms.length === 0 ? (
            <T style={{ color: MUTED }}>아직 참여 중인 공유 루틴이 없습니다.</T>
          ) : (
            <View style={{ gap: 10 }}>
              {rooms.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => goBoard(r.id, r.routine_title)}
                  style={{
                    backgroundColor: '#0F151D',
                    borderWidth: 1,
                    borderColor: LINE,
                    borderRadius: 16,
                    padding: 12,
                  }}
                >
                  <T style={{ color: TEXT, fontWeight: '900', fontSize: 15 }}>
                    {r.routine_title ?? '루틴'}
                  </T>
                  <T style={{ color: MUTED, marginTop: 6, fontSize: 12, fontWeight: '900' }}>
                    참여 코드: {r.join_code} · 상태: {r.is_active ? '활성' : '비활성'}
                  </T>
                </Pressable>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}
