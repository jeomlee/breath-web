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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ConnectStackParamList } from '../navigation/types';
import { supabase } from '../api/supabaseClient';
import { ensureRoomForRoutine, type SharedRoom } from '../api/sharedRoutines';
import ScreenContainer from '../components/ScreenContainer';

const BG = '#0B0F14';
const CARD = '#121A23';
const LINE = '#1E2A38';
const MUTED = '#8FA3B8';
const TEXT = '#EAF2FF';
const BLUE = '#4CC9FF';

type RoutineRow = { id: string; title: string; is_active: boolean; sort_order: number | null };

/* =========================
   ✅ Text wrapper (폰트 스케일 고정)
========================= */
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
  const nav = useNavigation<NativeStackNavigationProp<ConnectStackParamList>>();

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

      const list = ((data as any) || []) as RoutineRow[];
      setRoutines(list);

      // 선택 유지(존재할 때만)
      if (selectedId && !list.some((r) => r.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '기록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  const shareText = useMemo(() => {
    if (!createdRoom) return '';
    return `함께 기록을 진행해 보실까요?\n\n참여 코드: ${createdRoom.join_code}\n\n브리드 앱에서 [함께하기] → 코드로 참여하실 수 있습니다.`;
  }, [createdRoom]);

  const createRoom = useCallback(async () => {
    if (!selectedId) {
      Alert.alert('안내', '먼저 기록을 선택해 주세요.');
      return;
    }

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
  }, [selectedId]);

  const copyCode = async () => {
    if (!createdRoom?.join_code) return;
    await Clipboard.setStringAsync(createdRoom.join_code);
    Alert.alert('복사됨', '참여 코드가 복사되었습니다.');
  };

  const shareNow = async () => {
    if (!shareText) return;
    try {
      await Share.share({ message: shareText });
    } catch {
      Alert.alert('안내', '공유를 진행하지 못했습니다.');
    }
  };

  const goBoard = () => {
    if (!createdRoom) return;
    nav.navigate('SharedRoutineBoard', { roomId: createdRoom.id, routineTitle: undefined });
  };

  const selectedTitle = useMemo(() => {
    const r = routines.find((x) => x.id === selectedId);
    return r?.title ?? null;
  }, [routines, selectedId]);

  return (
    <ScreenContainer bg={BG} barStyle="light-content">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 18,
        }}
        refreshControl={<RefreshControl tintColor={BLUE} refreshing={loading} onRefresh={load} />}
        showsVerticalScrollIndicator={false}
      >
        {/* 헤더 */}
        <View style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T style={{ color: TEXT, fontSize: 24, fontWeight: '900' }}>내 기록 공유하기</T>

            {/* ✅ 버튼스러운 "이전" */}
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
              hitSlop={10}
            >
              <T style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>이전</T>
            </Pressable>
          </View>

          <T style={{ color: MUTED, marginTop: 6, lineHeight: 20 }}>
            기록을 선택한 뒤, ‘참여 코드 만들기’를 눌러 생성하세요.
          </T>
        </View>

        {/* 기록 선택 */}
        <Card title="기록 선택" desc="먼저 공유할 기록을 고르세요. (선택만 됩니다)">
          {routines.length === 0 ? (
            <T style={{ color: MUTED }}>공유할 기록이 없습니다. 먼저 기록을 생성해 주세요.</T>
          ) : (
            <View style={{ gap: 10 }}>
              {routines.map((r) => {
                const selected = r.id === selectedId;

                return (
                  <Pressable
                    key={r.id}
                    onPress={() => {
                      setSelectedId(r.id);
                      // ✅ 다른 기록을 선택하면 기존 생성된 코드가 "다른 기록"일 수 있으니 초기화(혼란 방지)
                      setCreatedRoom(null);
                    }}
                    style={{
                      backgroundColor: selected ? 'rgba(76,201,255,0.10)' : '#0F151D',
                      borderWidth: 1,
                      borderColor: selected ? 'rgba(76,201,255,0.35)' : LINE,
                      borderRadius: 16,
                      padding: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <T style={{ color: TEXT, fontWeight: '900' }} numberOfLines={1}>
                        {r.title}
                      </T>
                      <T style={{ color: MUTED, marginTop: 6, fontSize: 12, fontWeight: '900' }}>
                        {selected ? '선택됨' : '눌러서 선택'}
                      </T>
                    </View>

                    {/* ✅ 라디오 인디케이터 */}
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        borderWidth: 2,
                        borderColor: selected ? BLUE : 'rgba(143,163,184,0.35)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {selected ? (
                        <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: BLUE }} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* ✅ 선택 후 생성 CTA (핵심) */}
          <Pressable
            onPress={createRoom}
            disabled={!selectedId || creating}
            style={{
              marginTop: 12,
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: 'center',
              backgroundColor: !selectedId ? '#0E141C' : BLUE,
              borderWidth: 1,
              borderColor: !selectedId ? LINE : 'rgba(76,201,255,0.45)',
              opacity: creating ? 0.7 : 1,
            }}
          >
            <T style={{ color: !selectedId ? MUTED : '#001018', fontWeight: '900' }}>
              {creating ? '생성 중…' : selectedTitle ? `참여 코드 만들기 · ${selectedTitle}` : '참여 코드 만들기'}
            </T>
          </Pressable>

          {!selectedId ? (
            <T style={{ color: MUTED, marginTop: 10, fontSize: 12, lineHeight: 18 }}>
              기록을 선택하면 버튼이 활성화됩니다.
            </T>
          ) : null}
        </Card>

        {/* 참여 코드 */}
        <Card title="참여 코드" desc="상대방은 이 코드로 참여하실 수 있습니다.">
          {!createdRoom ? (
            <T style={{ color: MUTED }}>아직 코드가 없습니다. 위에서 ‘참여 코드 만들기’를 눌러주세요.</T>
          ) : (
            <View style={{ gap: 10 }}>
              <View
                style={{
                  backgroundColor: '#0F151D',
                  borderWidth: 1,
                  borderColor: LINE,
                  borderRadius: 16,
                  padding: 12,
                }}
              >
                <T style={{ color: TEXT, fontWeight: '900', fontSize: 22, letterSpacing: 1 }}>
                  {createdRoom.join_code}
                </T>
                <T style={{ color: MUTED, marginTop: 6, fontSize: 12, fontWeight: '900' }}>
                  코드가 동일하면 같은 공유 기록에 참여합니다.
                </T>
              </View>

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
