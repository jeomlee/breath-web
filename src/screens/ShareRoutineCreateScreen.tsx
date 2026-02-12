// src/screens/ShareRoutineCreateScreen.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text as RNText,
  ScrollView,
  Pressable,
  Alert,
  Share,
  RefreshControl,
  type TextProps,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ConnectStackParamList, RootTabParamList } from '../navigation/types';
import { supabase } from '../api/supabaseClient';
import { ensureRoomForRoutine, type SharedRoom } from '../api/sharedRoutines';
import ScreenContainer from '../components/ScreenContainer';

const BG = '#0B0F14';
const CARD = '#121A23';
const LINE = '#1E2A38';
const MUTED = '#8FA3B8';
const TEXT = '#EAF2FF';
const BLUE = '#4CC9FF';

type RoutineRow = {
  id: string;
  title: string;
  is_active: boolean;
  sort_order: number | null;
};

function T(props: TextProps) {
  return <RNText {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}

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

export default function ShareRoutineCreateScreen() {
  const nav = useNavigation<
    CompositeNavigationProp<NativeStackNavigationProp<ConnectStackParamList>, BottomTabNavigationProp<RootTabParamList>>
  >();

  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [createdRoom, setCreatedRoom] = useState<SharedRoom | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('routines')
        .select('id,title,is_active,sort_order')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      const list = (data ?? []) as RoutineRow[];
      setRoutines(list);

      if (selectedId && !list.some((r) => r.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '호흡을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  const hasRoutines = routines.length > 0;

  const selectedTitle = useMemo(() => {
    const r = routines.find((x) => x.id === selectedId);
    return r?.title ?? null;
  }, [routines, selectedId]);

  const canCreate = hasRoutines && !!selectedId && !creating;

  const createRoom = useCallback(async () => {
    if (!selectedId) return;

    const title = selectedTitle ?? '선택한 호흡';

    Alert.alert(
      '참여 코드 만들기',
      `“${title}”을(를) 공유할까요?\n\n코드를 만든 뒤에는 복사/공유할 수 있어요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '만들기',
          style: 'default',
          onPress: async () => {
            setCreating(true);
            try {
              const room = await ensureRoomForRoutine(selectedId);
              setCreatedRoom(room);
              Alert.alert('완료', '참여 코드가 생성되었습니다.');
            } catch (e: any) {
              Alert.alert('오류', e?.message ?? '생성에 실패하였습니다.');
            } finally {
              setCreating(false);
            }
          },
        },
      ]
    );
  }, [selectedId, selectedTitle]);

  const shareText = useMemo(() => {
    if (!createdRoom) return '';
    const code = createdRoom.join_code;
    const title = selectedTitle ? `“${selectedTitle}”` : '함께 호흡';
    return `${code}`;
  }, [createdRoom, selectedTitle]);

  const copyCode = async () => {
    if (!createdRoom?.join_code) return;
    await Clipboard.setStringAsync(createdRoom.join_code);
    Alert.alert('복사됨', '참여 코드가 복사되었습니다.');
  };

  const shareNow = async () => {
    if (!shareText) return;
    await Share.share({ message: shareText });
  };

  const goBoard = () => {
    if (!createdRoom) return;
    nav.navigate('SharedRoutineBoard', { roomId: createdRoom.id, routineTitle: undefined });
  };

  const goCreateRoutine = useCallback(() => {
    nav.navigate('Dashboard', { screen: 'RoutineCreate' });
  }, [nav]);

  return (
    <ScreenContainer bg={BG} barStyle="light-content">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18 }}
        refreshControl={<RefreshControl tintColor={BLUE} refreshing={loading} onRefresh={load} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T style={{ color: TEXT, fontSize: 24, fontWeight: '900' }}>내 호흡 공유하기</T>
            <Pressable
              onPress={() => nav.goBack()}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor: '#0E141C',
                borderWidth: 1,
                borderColor: LINE,
              }}
            >
              <T style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>이전</T>
            </Pressable>
          </View>
          <T style={{ color: MUTED, marginTop: 6 }}>
            호흡을 선택한 뒤, ‘참여 코드 만들기’를 눌러 생성하세요.
          </T>
        </View>

        {/* 호흡 선택 */}
        <Card title="호흡 선택" desc="먼저 공유할 호흡을 고르세요.">
          {!hasRoutines ? (
            <View style={{ gap: 10 }}>
              <T style={{ color: MUTED }}>공유할 호흡이 없습니다.</T>
              <Pressable
                onPress={goCreateRoutine}
                style={{
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: 'center',
                  backgroundColor: 'rgba(76,201,255,0.16)',
                  borderWidth: 1,
                  borderColor: 'rgba(76,201,255,0.25)',
                }}
              >
                <T style={{ color: BLUE, fontWeight: '900' }}>호흡 만들기</T>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {routines.map((r) => {
                const selected = r.id === selectedId;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => {
                      setSelectedId(r.id);
                      setCreatedRoom(null);
                    }}
                    style={{
                      backgroundColor: selected ? 'rgba(76,201,255,0.10)' : '#0F151D',
                      borderWidth: 1,
                      borderColor: selected ? 'rgba(76,201,255,0.35)' : LINE,
                      borderRadius: 16,
                      padding: 12,
                    }}
                  >
                    <T style={{ color: TEXT, fontWeight: '900' }}>{r.title}</T>
                    <T style={{ color: MUTED, marginTop: 6, fontSize: 12 }}>
                      {selected ? '선택됨' : '눌러서 선택'}
                    </T>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* CTA */}
          <Pressable
            onPress={createRoom}
            disabled={!canCreate}
            style={{
              marginTop: 12,
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: 'center',
              backgroundColor: canCreate ? BLUE : '#0C1118',
              borderWidth: 1,
              borderColor: canCreate ? 'rgba(76,201,255,0.45)' : 'rgba(30,42,56,0.55)',
              opacity: canCreate ? 1 : 0.35,
            }}
          >
            <T style={{ color: canCreate ? '#001018' : 'rgba(143,163,184,0.55)', fontWeight: '900' }}>
              {creating ? '생성 중…' : selectedTitle ? `참여 코드 만들기 · ${selectedTitle}` : '참여 코드 만들기'}
            </T>
          </Pressable>

          {hasRoutines && !selectedId ? (
            <T style={{ color: 'rgba(143,163,184,0.55)', marginTop: 10, fontSize: 12 }}>
              호흡을 선택하면 버튼이 활성화됩니다.
            </T>
          ) : null}
        </Card>

        {/* 참여 코드 */}
        <Card title="참여 코드">
          {!createdRoom ? (
            <T style={{ color: MUTED }}>아직 코드가 없습니다.</T>
          ) : (
            <View style={{ gap: 10 }}>
              <T style={{ color: TEXT, fontWeight: '900', fontSize: 22 }}>{createdRoom.join_code}</T>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={copyCode}
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: 'center',
                    backgroundColor: '#0E141C',
                    borderWidth: 1,
                    borderColor: LINE,
                  }}
                >
                  <T style={{ color: MUTED, fontWeight: '900' }}>코드 복사</T>
                </Pressable>

                <Pressable
                  onPress={shareNow}
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: 'center',
                    backgroundColor: 'rgba(76,201,255,0.16)',
                    borderWidth: 1,
                    borderColor: 'rgba(76,201,255,0.25)',
                  }}
                >
                  <T style={{ color: BLUE, fontWeight: '900' }}>바로 공유</T>
                </Pressable>
              </View>

              <Pressable
                onPress={goBoard}
                style={{
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: 'center',
                  backgroundColor: BLUE,
                }}
              >
                <T style={{ color: '#001018', fontWeight: '900' }}>보드로 이동</T>
              </Pressable>
            </View>
          )}
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}
