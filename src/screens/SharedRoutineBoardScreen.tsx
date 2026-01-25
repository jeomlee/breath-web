// src/screens/SharedRoutineBoardScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  RefreshControl,
  Share,
  ActivityIndicator,
} from 'react-native';
import dayjs from 'dayjs';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ConnectStackParamList } from '../navigation/types';
import { supabase } from '../api/supabaseClient';

import {
  fetchBoard,
  fetchStatusesRange,
  getRoomById,
  upsertTodayStatus,
  type DailyStatus,
  type Member,
  type SharedRoom,
} from '../api/sharedRoutines';

const BG = '#0B0F14';
const CARD = '#121A23';
const LINE = '#1E2A38';
const MUTED = '#8FA3B8';
const TEXT = '#EAF2FF';

const BLUE = '#4CC9FF'; // 완료
const GREEN = '#3BE7B0'; // 휴식

function CellColor(st?: 'focus' | 'rest') {
  if (st === 'focus') return 'rgba(76,201,255,0.85)'; // BLUE
  if (st === 'rest') return 'rgba(59,231,176,0.78)'; // GREEN
  return 'rgba(255,255,255,0.06)';
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
      <Text allowFontScaling={false} style={{ color: TEXT, fontSize: 15, fontWeight: '900' }}>
        {title}
      </Text>
      {desc ? (
        <Text allowFontScaling={false} style={{ color: MUTED, marginTop: 6, lineHeight: 20 }}>
          {desc}
        </Text>
      ) : null}
      <View style={{ marginTop: 12 }}>{children}</View>
    </View>
  );
}

export default function SharedRoutineBoardScreen() {
  const insets = useSafeAreaInsets();

  const route = useRoute<RouteProp<ConnectStackParamList, 'SharedRoutineBoard'>>();
  const nav = useNavigation<NativeStackNavigationProp<ConnectStackParamList>>();
  const roomId = route.params.roomId;

  const title = route.params.routineTitle ?? '공유 기록';
  const todayKey = dayjs().format('YYYY-MM-DD');

  // ✅ 최근 3주 (21일) = 오늘 포함 21일 표시
  const RANGE_DAYS = 21;
  const fromKey = useMemo(() => dayjs().subtract(RANGE_DAYS - 1, 'day').format('YYYY-MM-DD'), [RANGE_DAYS]);
  const toKey = todayKey;

  const [room, setRoom] = useState<SharedRoom | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [todayStatuses, setTodayStatuses] = useState<DailyStatus[]>([]);
  const [rangeStatuses, setRangeStatuses] = useState<DailyStatus[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // ✅ 내 uid(버튼 선택상태 + 나가기)
  const [myUid, setMyUid] = useState<string | null>(null);

  // ✅ profiles.nickname map
  const [nicknameMap, setNicknameMap] = useState<Record<string, string>>({});

  // ✅ 상단 여백(헤더가 너무 위로 몰리지 않게 + 불필요한 여백 최소화)
  // - 노치/상태바 영역은 안전하게 확보하면서, 과한 공백은 줄임
  const topPad = useMemo(() => Math.max(insets.top + 6, 12), [insets.top]);


  useEffect(() => {
    (async () => {
      const user = (await supabase.auth.getUser()).data.user;
      setMyUid(user?.id ?? null);
    })();
  }, []);

  const loadNicknames = useCallback(async (userIds: string[]) => {
    if (userIds.length === 0) return;

    const uniq = Array.from(new Set(userIds)).slice(0, 300);

    const { data, error } = await supabase.from('profiles').select('user_id,nickname').in('user_id', uniq);

    if (error) {
      // 닉네임은 부가정보라 실패해도 UI는 살아야 함
      console.log('[profiles load error]', error);
      return;
    }

    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row?.user_id) map[row.user_id] = (row.nickname ?? '').trim();
    }
    setNicknameMap(map);
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await getRoomById(roomId);
      setRoom(r);

      const board = await fetchBoard(roomId, todayKey);
      setMembers(board.members);
      setTodayStatuses(board.statuses);

      const rs = await fetchStatusesRange(roomId, fromKey, toKey);
      setRangeStatuses(rs);

      const ids = (board.members ?? []).map((m) => m.user_id).filter(Boolean);
      await loadNicknames(ids);
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '불러오기에 실패하였습니다.');
    } finally {
      setRefreshing(false);
    }
  }, [fromKey, loadNicknames, roomId, todayKey, toKey]);

  useEffect(() => {
    load();
  }, [load]);

  const statusMapToday = useMemo(() => {
    const m = new Map<string, 'focus' | 'rest'>();
    for (const s of todayStatuses) m.set(s.user_id, s.status);
    return m;
  }, [todayStatuses]);

  const myToday = useMemo<null | 'focus' | 'rest'>(() => {
    if (!myUid) return null;
    return statusMapToday.get(myUid) ?? null;
  }, [myUid, statusMapToday]);

  const statusMapRange = useMemo(() => {
    const m = new Map<string, 'focus' | 'rest'>();
    for (const s of rangeStatuses) m.set(`${s.user_id}|${s.date_key}`, s.status);
    return m;
  }, [rangeStatuses]);

  const days = useMemo(() => {
    const arr: string[] = [];
    for (let i = RANGE_DAYS - 1; i >= 0; i--) {
      arr.push(dayjs().subtract(i, 'day').format('YYYY-MM-DD'));
    }
    return arr; // old -> today
  }, [RANGE_DAYS]);

  const setMyStatus = useCallback(
    async (st: 'focus' | 'rest') => {
      try {
        setRefreshing(true);
        await upsertTodayStatus(roomId, st);
        await load();
      } catch (e: any) {
        Alert.alert('오류', e?.message ?? '저장에 실패하였습니다.');
      } finally {
        setRefreshing(false);
      }
    },
    [load, roomId]
  );

  const shareInvite = useCallback(async () => {
    if (!room?.join_code) return Alert.alert('안내', '참여 코드를 찾을 수 없습니다.');

    const msg = `함께 기록을 진행해 보실까요?\n\n참여 코드: ${room.join_code}\n\n브리드 앱에서 [함께하기] → 코드로 참여하실 수 있습니다.`;

    try {
      await Share.share({ message: msg });
    } catch {
      Alert.alert('안내', '공유를 진행하지 못했습니다.');
    }
  }, [room?.join_code]);

  const counts = useMemo(() => {
    let focus = 0;
    let rest = 0;
    for (const m of members) {
      const st = statusMapToday.get(m.user_id);
      if (st === 'focus') focus += 1;
      else if (st === 'rest') rest += 1;
    }
    const total = members.length;
    const none = Math.max(0, total - focus - rest);
    return { total, focus, rest, none };
  }, [members, statusMapToday]);

  // ✅ 명칭: "나가기"는 화면 뒤로와 혼동될 수 있어서
  //    "공유 기록 나가기"로 명확하게 (의도: 그룹/방 탈퇴)
  const LEAVE_LABEL = '공유 기록 나가기';

  // ✅ 나가기(탈퇴): shared_routine_members에서 (room_id, user_id) row 삭제
  const leaveRoom = useCallback(async () => {
    if (!myUid) return Alert.alert('안내', '로그인이 필요합니다.');

    setRefreshing(true);
    try {
      const { error } = await supabase
        .from('shared_routine_members')
        .delete()
        .eq('room_id', roomId)
        .eq('user_id', myUid);

      if (error) throw error;

      Alert.alert('완료', '공유 기록에서 나가기 처리가 완료되었습니다.');
      nav.goBack();
    } catch (e: any) {
      console.log('[leaveRoom error]', e);
      Alert.alert('오류', '요청을 처리하지 못했습니다.\n잠시 후 다시 시도해 주세요.');
    } finally {
      setRefreshing(false);
    }
  }, [myUid, nav, roomId]);

  const askLeave = useCallback(() => {
    Alert.alert(
      '공유 기록 나가기',
      '이 공유 기록에서 나가시겠습니까?\n다시 참여하려면 참여 코드로 재참여하셔야 합니다.',
      [
        { text: '취소', style: 'cancel' },
        { text: '나가기', style: 'destructive', onPress: leaveRoom },
      ]
    );
  }, [leaveRoom]);

  // ✅ 버튼 활성/비활성
  const doneActive = myToday === 'focus';
  const restActive = myToday === 'rest';

  const DoneBtnStyle = useMemo(
    () => ({
      flex: 1,
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: 'center' as const,
      backgroundColor: doneActive ? 'rgba(76,201,255,0.18)' : '#0E141C',
      borderWidth: 1,
      borderColor: doneActive ? 'rgba(76,201,255,0.40)' : LINE,
    }),
    [doneActive]
  );

  const RestBtnStyle = useMemo(
    () => ({
      flex: 1,
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: 'center' as const,
      backgroundColor: restActive ? 'rgba(59,231,176,0.16)' : '#0E141C',
      borderWidth: 1,
      borderColor: restActive ? 'rgba(59,231,176,0.38)' : LINE,
    }),
    [restActive]
  );

  const displayName = useCallback(
    (m: Member) => {
      const nn = (nicknameMap[m.user_id] ?? '').trim();
      if (nn) return nn;
      const dn = (m.display_name ?? '').trim();
      if (dn) return dn;
      return '사용자';
    },
    [nicknameMap]
  );

  // ✅ 히트맵 레이아웃 값 (이름/아래 잘림 방지)
  const NAME_COL_W = 104;
  const CELL = 10;
  const GAP = 2;
  const WEEK = 7;

  const gridWidth = useMemo(() => RANGE_DAYS * (CELL + GAP), [RANGE_DAYS]);
  const headerBlocks = useMemo(() => Math.ceil(RANGE_DAYS / WEEK), [RANGE_DAYS]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 18 }}
      refreshControl={<RefreshControl tintColor={BLUE} refreshing={refreshing} onRefresh={load} />}
    >
      {/* Header */}
      <View
        style={{
          paddingTop: topPad, // ✅ 여백 축소 + 안전영역 반영
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {/* ✅ 직관적 뒤로가기 버튼 */}
        <Pressable
          onPress={() => nav.goBack()}
          hitSlop={10}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0F151D',
            borderWidth: 1,
            borderColor: LINE,
          }}
        >
          <Text
            allowFontScaling={false}
            style={{
              color: MUTED,
              fontSize: 18,
              fontWeight: '900',
              lineHeight: 18,
              includeFontPadding: false,
            }}
          >
            ←
          </Text>
        </Pressable>

        {/* ✅ 오른쪽 액션: 공유 기록 나가기 + 공유 */}
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Pressable
            onPress={askLeave}
            disabled={refreshing}
            hitSlop={6}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: 'rgba(255,107,107,0.10)',
              borderWidth: 1,
              borderColor: 'rgba(255,107,107,0.20)',
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            <Text allowFontScaling={false} style={{ color: '#FF6B6B', fontWeight: '900' }}>
              {LEAVE_LABEL}
            </Text>
          </Pressable>

          <Pressable
            onPress={shareInvite}
            hitSlop={6}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: 'rgba(76,201,255,0.12)',
              borderWidth: 1,
              borderColor: 'rgba(76,201,255,0.25)',
            }}
          >
            <Text allowFontScaling={false} style={{ color: BLUE, fontWeight: '900' }}>
              공유
            </Text>
          </Pressable>
        </View>
      </View>

      <Text allowFontScaling={false} style={{ color: TEXT, fontSize: 22, fontWeight: '900', marginTop: 6 }}>
        {title}
      </Text>
      <Text allowFontScaling={false} style={{ color: MUTED, marginTop: 6, fontWeight: '900', fontSize: 12 }}>
        참여 코드: {room?.join_code ?? '—'} · {dayjs().format('M/D')} 기준
      </Text>

      {/* Today action */}
      <Card title="오늘 상태" desc="하루 한 번만 체크하시면 됩니다.">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={() => setMyStatus('focus')} style={DoneBtnStyle} disabled={refreshing}>
            <Text allowFontScaling={false} style={{ color: doneActive ? BLUE : MUTED, fontWeight: '900' }}>
              완료
            </Text>
          </Pressable>

          <Pressable onPress={() => setMyStatus('rest')} style={RestBtnStyle} disabled={refreshing}>
            <Text allowFontScaling={false} style={{ color: restActive ? GREEN : MUTED, fontWeight: '900' }}>
              휴식
            </Text>
          </Pressable>
        </View>

        {refreshing && (
          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={BLUE} />
            <Text allowFontScaling={false} style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>
              반영 중입니다…
            </Text>
          </View>
        )}

        <View style={{ marginTop: 10, flexDirection: 'row', gap: 10 }}>
          <View
            style={{
              flex: 1,
              backgroundColor: '#0F151D',
              borderWidth: 1,
              borderColor: LINE,
              borderRadius: 14,
              padding: 12,
            }}
          >
            <Text allowFontScaling={false} style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>
              오늘 팀 현황
            </Text>
            <Text allowFontScaling={false} style={{ fontWeight: '900', fontSize: 16, marginTop: 6 }}>
              <Text allowFontScaling={false} style={{ color: BLUE }}>
                완료 {counts.focus}
              </Text>
              <Text allowFontScaling={false} style={{ color: MUTED }}>
                {' '}
                ·{' '}
              </Text>
              <Text allowFontScaling={false} style={{ color: GREEN }}>
                휴식 {counts.rest}
              </Text>
              <Text allowFontScaling={false} style={{ color: MUTED }}>
                {' '}
                ·{' '}
              </Text>
              <Text allowFontScaling={false} style={{ color: MUTED }}>
                미체크 {counts.none}
              </Text>
            </Text>
          </View>
        </View>
      </Card>

      {/* Today list */}
      <Card title="오늘 체크 현황" desc="미체크도 상태입니다. 부담 없이 참여해 주세요.">
        {members.length === 0 ? (
          <Text allowFontScaling={false} style={{ color: MUTED }}>
            참여자가 없습니다.
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {members.map((m) => {
              const st = statusMapToday.get(m.user_id);
              const label = st === 'focus' ? '완료' : st === 'rest' ? '휴식' : '미체크';

              const badgeBg =
                st === 'focus'
                  ? 'rgba(76,201,255,0.14)'
                  : st === 'rest'
                  ? 'rgba(59,231,176,0.12)'
                  : 'rgba(255,255,255,0.06)';

              const badgeBorder =
                st === 'focus'
                  ? 'rgba(76,201,255,0.25)'
                  : st === 'rest'
                  ? 'rgba(59,231,176,0.22)'
                  : 'rgba(255,255,255,0.10)';

              const badgeText = st === 'focus' ? BLUE : st === 'rest' ? GREEN : MUTED;

              return (
                <View
                  key={m.user_id}
                  style={{
                    backgroundColor: '#0F151D',
                    borderWidth: 1,
                    borderColor: LINE,
                    borderRadius: 16,
                    padding: 12,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text allowFontScaling={false} style={{ color: TEXT, fontWeight: '900' }}>
                      {displayName(m)}
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={{ color: MUTED, marginTop: 4, fontSize: 12, fontWeight: '900' }}
                    >
                      {m.role === 'owner' ? '방장' : '참여자'}
                    </Text>
                  </View>

                  <View
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      backgroundColor: badgeBg,
                      borderWidth: 1,
                      borderColor: badgeBorder,
                    }}
                  >
                    <Text allowFontScaling={false} style={{ color: badgeText, fontWeight: '900' }}>
                      {label}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      {/* Heatmap */}
      <Card title="최근 3주 히트맵" desc="완료/휴식/미체크가 한눈에 보입니다.">
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: CellColor('focus') }} />
          <Text allowFontScaling={false} style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>
            완료
          </Text>

          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: CellColor('rest') }} />
          <Text allowFontScaling={false} style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>
            휴식
          </Text>

          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: CellColor(undefined) }} />
          <Text allowFontScaling={false} style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>
            미체크
          </Text>
        </View>

        <View style={{ paddingBottom: 6 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ gap: 10, paddingRight: 14 }}>
              {/* 상단 날짜 가이드(주 단위) */}
              <View style={{ flexDirection: 'row' }}>
                <View style={{ width: NAME_COL_W }} />

                {Array.from({ length: headerBlocks }).map((_, w) => {
                  const idx = w * WEEK;
                  const d = days[idx];
                  return (
                    <View key={w} style={{ width: WEEK * (CELL + GAP), alignItems: 'center' }}>
                      <Text
                        allowFontScaling={false}
                        style={{
                          color: MUTED,
                          fontSize: 10,
                          fontWeight: '900',
                          lineHeight: 12,
                          paddingTop: 2,
                          includeFontPadding: false,
                          textAlignVertical: 'top',
                        }}
                      >
                        {dayjs(d).format('M/D')}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* 멤버별 row */}
              {members.map((m) => (
                <View
                  key={m.user_id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    paddingTop: 2,
                  }}
                >
                  {/* 이름 컬럼 */}
                  <View style={{ width: NAME_COL_W, paddingRight: 10 }}>
                    <Text
                      allowFontScaling={false}
                      numberOfLines={1}
                      style={{
                        color: TEXT,
                        fontWeight: '900',
                        fontSize: 12,
                        lineHeight: 14,
                        includeFontPadding: false,
                        textAlignVertical: 'top',
                        paddingTop: 1,
                      }}
                    >
                      {displayName(m)}
                    </Text>
                  </View>

                  {/* 셀 그리드 */}
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      width: gridWidth,
                      paddingTop: 1,
                    }}
                  >
                    {days.map((d) => {
                      const st = statusMapRange.get(`${m.user_id}|${d}`);
                      return (
                        <View
                          key={`${m.user_id}-${d}`}
                          style={{
                            width: CELL,
                            height: CELL,
                            marginRight: GAP,
                            marginBottom: GAP,
                            borderRadius: 3,
                            backgroundColor: CellColor(st),
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.08)',
                          }}
                        />
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        <Text allowFontScaling={false} style={{ color: MUTED, fontSize: 12, marginTop: 8, lineHeight: 18 }}>
          화면이 좁은 기기에서는 좌우로 스크롤하여 확인하실 수 있습니다.
        </Text>
      </Card>

      <View style={{ height: 18 }} />
    </ScrollView>
  );
}
