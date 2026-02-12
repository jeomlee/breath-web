// src/screens/SharedRoutineBoardScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text as RNText,
  ScrollView,
  Pressable,
  Alert,
  RefreshControl,
  Share,
  ActivityIndicator,
  TextInput as RNTextInput,
  Platform,
  type TextProps,
  type TextInputProps,
} from 'react-native';
import dayjs from 'dayjs';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ConnectStackParamList } from '../navigation/types';
import { supabase } from '../api/supabaseClient';
import type { DailyStatus, Member, SharedRoom } from '../api/sharedRoutines';
import {
  getRoomById,
  fetchBoard,
  fetchStatusesRange,
  upsertTodayStatus,
  updateMyRoomDisplayName,
  leaveRoom as apiLeaveRoom,
  closeRoom,
  reopenRoom,
} from '../api/sharedRoutines';

const BG = '#0B0F14';
const CARD = '#121A23';
const LINE = '#1E2A38';
const MUTED = '#8FA3B8';
const TEXT = '#EAF2FF';

const BLUE = '#4CC9FF'; // focus
const GREEN = '#3BE7B0'; // rest
const RED = '#FF6B6B';

function T(props: TextProps) {
  return <RNText {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}
function TI(props: TextInputProps) {
  return <RNTextInput {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}

function CellColor(st?: 'focus' | 'rest') {
  if (st === 'focus') return 'rgba(76,201,255,0.85)';
  if (st === 'rest') return 'rgba(59,231,176,0.78)';
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
      <T style={{ color: TEXT, fontSize: 15, fontWeight: '900' }}>{title}</T>
      {desc ? <T style={{ color: MUTED, marginTop: 6, lineHeight: 20 }}>{desc}</T> : null}
      <View style={{ marginTop: 12 }}>{children}</View>
    </View>
  );
}

/** 안전 배열 */
function safeArr<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export default function SharedRoutineBoardScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<ConnectStackParamList, 'SharedRoutineBoard'>>();
  const nav = useNavigation<NativeStackNavigationProp<ConnectStackParamList>>();

  const roomId = String(route.params?.roomId ?? '');
  const passedTitle = route.params?.routineTitle ?? '공유 기록';
  const todayKey = dayjs().format('YYYY-MM-DD');

  // ✅ 히트맵 범위
  const RANGE_DAYS = 21;
  const fromKey = useMemo(() => dayjs().subtract(RANGE_DAYS - 1, 'day').format('YYYY-MM-DD'), [RANGE_DAYS]);
  const toKey = todayKey;

  const [room, setRoom] = useState<SharedRoom | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [todayStatuses, setTodayStatuses] = useState<DailyStatus[]>([]);
  const [rangeStatuses, setRangeStatuses] = useState<DailyStatus[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [myUid, setMyUid] = useState<string | null>(null);

  // ✅ 닉네임 입력/저장 UI
  const [myNickInput, setMyNickInput] = useState('');
  const [nickSaving, setNickSaving] = useState(false);

  const topPad = useMemo(() => Math.max(insets.top + 8, 14), [insets.top]);

  useEffect(() => {
    (async () => {
      const user = (await supabase.auth.getUser()).data.user;
      setMyUid(user?.id ?? null);
    })();
  }, []);

  // ✅ 표시 제목: room.routine_title 우선
  const title = useMemo(() => {
    const rt = String((room as any)?.routine_title ?? '').trim();
    if (rt) return rt;
    return passedTitle;
  }, [room, passedTitle]);

  const isActive = !!(room as any)?.is_active;

  const isOwner = useMemo(() => {
    if (!myUid) return false;
    const byRoom = String((room as any)?.owner_id ?? '') === myUid;
    const me = members.find((m) => m.user_id === myUid);
    const byMember = String(me?.role ?? '').toLowerCase() === 'owner';
    return byRoom || byMember;
  }, [members, myUid, room]);

  const load = useCallback(async () => {
    if (!roomId) return;

    setRefreshing(true);
    try {
      const r = await getRoomById(roomId);
      setRoom(r);

      const board = await fetchBoard(roomId, todayKey);
      const m = safeArr<Member>(board?.members);
      const s = safeArr<DailyStatus>(board?.statuses);

      setMembers(m);
      setTodayStatuses(s);

      const rs = await fetchStatusesRange(roomId, fromKey, toKey);
      setRangeStatuses(safeArr<DailyStatus>(rs));

      // 내 닉네임 초기 세팅
      if (myUid) {
        const meRow = m.find((x) => x.user_id === myUid);
        const cur = String(meRow?.display_name ?? '').trim();
        setMyNickInput((prev) => (prev.trim().length > 0 ? prev : cur));
      }
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '불러오기에 실패하였습니다.');
    } finally {
      setRefreshing(false);
    }
  }, [fromKey, myUid, roomId, todayKey, toKey]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {};
    }, [load])
  );

  const statusMapToday = useMemo(() => {
    const m = new Map<string, 'focus' | 'rest'>();
    for (const s of safeArr<DailyStatus>(todayStatuses)) m.set(s.user_id, s.status);
    return m;
  }, [todayStatuses]);

  const myToday = useMemo<null | 'focus' | 'rest'>(() => {
    if (!myUid) return null;
    return statusMapToday.get(myUid) ?? null;
  }, [myUid, statusMapToday]);

  const statusMapRange = useMemo(() => {
    const m = new Map<string, 'focus' | 'rest'>();
    for (const s of safeArr<DailyStatus>(rangeStatuses)) m.set(`${s.user_id}|${s.date_key}`, s.status);
    return m;
  }, [rangeStatuses]);

  const days = useMemo(() => {
    const arr: string[] = [];
    for (let i = RANGE_DAYS - 1; i >= 0; i--) arr.push(dayjs().subtract(i, 'day').format('YYYY-MM-DD'));
    return arr;
  }, [RANGE_DAYS]);

  const setMyStatus = useCallback(
    async (st: 'focus' | 'rest') => {
      if (!roomId) return;
      if (!isActive) return Alert.alert('안내', '종료된 공유 호흡입니다. (방장이 다시 열기 후 체크 가능)');
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
    [isActive, load, roomId]
  );

  /** ✅ 공유는 코드만 */
  const shareInvite = useCallback(async () => {
    const code = String((room as any)?.join_code ?? '').trim();
    if (!code) return Alert.alert('안내', '참여 코드를 찾을 수 없습니다.');
    try {
      await Share.share({ message: code });
    } catch {
      Alert.alert('안내', '공유를 진행하지 못했습니다.');
    }
  }, [room]);

  /**
   * ✅ 표시 이름 우선순위 (방 닉네임 최우선)
   * 1) members.display_name
   * 2) members.email
   * 3) user_id
   */
  const displayName = useCallback((m: Member) => {
    const roomNick = String(m.display_name ?? '').trim();
    if (roomNick) return roomNick;

    const email = String(m.email ?? '').trim();
    if (email) return email;

    return m.user_id;
  }, []);

  /** ✅ 닉네임 저장 */
  const saveMyNickname = useCallback(async () => {
    if (!roomId) return;
    if (!myUid) return Alert.alert('안내', '로그인이 필요합니다.');

    const nn = myNickInput.trim();
    if (nn.length < 1) return Alert.alert('안내', '닉네임을 입력해 주세요.');

    setNickSaving(true);
    try {
      await updateMyRoomDisplayName(roomId, nn);
      setMembers((prev) => prev.map((m) => (m.user_id === myUid ? { ...m, display_name: nn } : m)));
      Alert.alert('완료', '닉네임이 저장되었습니다.');
      await load();
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '닉네임 저장에 실패하였습니다.\n잠시 후 다시 시도해 주세요.');
    } finally {
      setNickSaving(false);
    }
  }, [load, myNickInput, myUid, roomId]);

  const counts = useMemo(() => {
    let focus = 0;
    let rest = 0;
    for (const m of safeArr<Member>(members)) {
      const st = statusMapToday.get(m.user_id);
      if (st === 'focus') focus += 1;
      else if (st === 'rest') rest += 1;
    }
    const total = safeArr<Member>(members).length;
    const none = Math.max(0, total - focus - rest);
    return { total, focus, rest, none };
  }, [members, statusMapToday]);

  const checkRate = useMemo(() => {
    const total = counts.total || 0;
    if (total <= 0) return 0;
    const checked = counts.focus + counts.rest;
    return Math.round((checked / total) * 100);
  }, [counts]);

  const teamSummaryText = useMemo(() => {
    const total = counts.total;
    const none = counts.none;

    if (total <= 0) return '참여자가 없습니다.';
    if (!isActive) return '이 공유 호흡은 종료된 상태입니다.';
    if (checkRate === 0) return '아직 아무도 체크하지 않았어요.';
    if (checkRate < 40) return `오늘은 아직 조용해요. (미체크 ${none}명)`;
    if (checkRate < 70) return `절반 정도 진행됐어요. (미체크 ${none}명)`;
    if (checkRate < 100) return `거의 다 왔어요. (미체크 ${none}명)`;
    return '오늘은 전원 체크 완료 🎉';
  }, [checkRate, counts.none, counts.total, isActive]);

  /** =========================
   * ✅ 나가기(권한 모델)
   ========================= */

  const pickSuccessor = useCallback((): Member | null => {
    const others = safeArr<Member>(members).filter((m) => m.user_id && m.user_id !== myUid);
    if (others.length === 0) return null;

    // joined_at 기준 오름차순(가장 오래된 멤버)
    others.sort((a, b) => String(a.joined_at ?? '').localeCompare(String(b.joined_at ?? '')));
    return others[0] ?? null;
  }, [members, myUid]);

  const transferOwnership = useCallback(
    async (newOwnerId: string) => {
      const { data: existRows, error: existErr } = await supabase
        .from('shared_routine_members')
        .select('user_id')
        .eq('room_id', roomId)
        .eq('user_id', newOwnerId)
        .limit(1);

      if (existErr) throw existErr;
      if (!existRows || existRows.length === 0) {
        throw new Error('위임 대상이 방 멤버가 아닙니다.');
      }

      const { data: toOwnerRows, error: toOwnerErr } = await supabase
        .from('shared_routine_members')
        .update({ role: 'owner' })
        .eq('room_id', roomId)
        .eq('user_id', newOwnerId)
        .select('user_id, role');

      if (toOwnerErr) throw toOwnerErr;
      if (!toOwnerRows || toOwnerRows.length === 0) {
        throw new Error('새 방장 권한 부여에 실패했습니다.');
      }

      const { data: roomRows, error: rErr } = await supabase
        .from('shared_routine_rooms')
        .update({ owner_id: newOwnerId })
        .eq('id', roomId)
        .select('id, owner_id');

      if (rErr) throw rErr;
      if (!roomRows || roomRows.length === 0) {
        throw new Error('방장 위임에 실패했습니다. (권한 정책/RLS 확인 필요)');
      }
      if (String(roomRows[0].owner_id) !== String(newOwnerId)) {
        throw new Error('방장 위임 검증에 실패했습니다.');
      }

      if (myUid) {
        const { error: meDownErr } = await supabase
          .from('shared_routine_members')
          .update({ role: 'member' })
          .eq('room_id', roomId)
          .eq('user_id', myUid);

        if (meDownErr) {
          // ignore
        }
      }
    },
    [myUid, roomId]
  );

  const doLeaveAsMember = useCallback(async () => {
    setRefreshing(true);
    try {
      await apiLeaveRoom(roomId);
      Alert.alert('완료', '공유 기록에서 나갔습니다.');
      nav.goBack();
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '요청을 처리하지 못했습니다.\n잠시 후 다시 시도해 주세요.');
    } finally {
      setRefreshing(false);
    }
  }, [nav, roomId]);

  const doLeaveAsOwnerWithConfirm = useCallback(() => {
    const successor = pickSuccessor();

    if (!successor) {
      Alert.alert(
        '공유 기록 나가기',
        '이 공유 기록에서 나가시겠습니까?\n참여자가 없어 방은 자동으로 정리됩니다.',
        [
          { text: '아니오', style: 'cancel' },
          {
            text: '예',
            style: 'destructive',
            onPress: async () => {
              setRefreshing(true);
              try {
                await apiLeaveRoom(roomId);
                nav.goBack();
              } catch (e: any) {
                Alert.alert('오류', e?.message ?? '요청을 처리하지 못했습니다.\n잠시 후 다시 시도해 주세요.');
              } finally {
                setRefreshing(false);
              }
            },
          },
        ]
      );
      return;
    }

    const successorName = displayName(successor);

    Alert.alert('방장 위임 후 나가기', `방장을 '${successorName}'에게 넘기고 나가시겠습니까?`, [
      { text: '아니오', style: 'cancel' },
      {
        text: '예',
        style: 'destructive',
        onPress: async () => {
          setRefreshing(true);
          try {
            await transferOwnership(successor.user_id);
            await apiLeaveRoom(roomId);

            Alert.alert('완료', '방장을 넘기고 나갔습니다.');
            nav.goBack();
          } catch (e: any) {
            Alert.alert('오류', e?.message ?? '처리에 실패했습니다.');
          } finally {
            setRefreshing(false);
          }
        },
      },
    ]);
  }, [apiLeaveRoom, displayName, nav, pickSuccessor, roomId, transferOwnership]);

  const askLeave = useCallback(() => {
    if (isOwner) {
      doLeaveAsOwnerWithConfirm();
      return;
    }

    Alert.alert(
      '공유 기록 나가기',
      '이 공유 기록에서 나가시겠습니까?\n다시 참여하려면 참여 코드로 재참여하셔야 합니다.',
      [
        { text: '취소', style: 'cancel' },
        { text: '나가기', style: 'destructive', onPress: doLeaveAsMember },
      ]
    );
  }, [doLeaveAsMember, doLeaveAsOwnerWithConfirm, isOwner]);

  /** ✅ 방장 전용: 종료/다시열기 */
  const endRoom = useCallback(async () => {
    if (!roomId) return;
    if (!isOwner) return Alert.alert('안내', '방장만 종료할 수 있습니다.');

    setRefreshing(true);
    try {
      await closeRoom(roomId);
      Alert.alert('완료', '공유 호흡이 종료되었습니다.');
      await load();
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '종료에 실패하였습니다.');
    } finally {
      setRefreshing(false);
    }
  }, [isOwner, load, roomId]);

  const askEnd = useCallback(() => {
    Alert.alert(
      '공유 호흡 종료',
      '이 공유 호흡을 종료하시겠습니까?\n종료되면 신규 참여와 오늘 체크가 막힙니다.\n(방장은 “다시 열기”로 복구할 수 있습니다.)',
      [
        { text: '취소', style: 'cancel' },
        { text: '종료', style: 'destructive', onPress: endRoom },
      ]
    );
  }, [endRoom]);

  const doReopen = useCallback(async () => {
    if (!roomId) return;
    if (!isOwner) return Alert.alert('안내', '방장만 다시 열 수 있습니다.');

    setRefreshing(true);
    try {
      await reopenRoom(roomId);
      Alert.alert('완료', '공유 호흡이 다시 열렸습니다.');
      await load();
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '다시 열기에 실패하였습니다.');
    } finally {
      setRefreshing(false);
    }
  }, [isOwner, load, roomId]);

  const askReopen = useCallback(() => {
    Alert.alert('다시 열기', '종료된 공유 호흡을 다시 여시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '다시 열기', onPress: doReopen },
    ]);
  }, [doReopen]);

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
      opacity: isActive ? 1 : 0.35,
    }),
    [doneActive, isActive]
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
      opacity: isActive ? 1 : 0.35,
    }),
    [restActive, isActive]
  );

  // ✅ 히트맵 레이아웃 값
  const NAME_COL_W = 172;
  const CELL = 10;
  const GAP = 2;
  const WEEK = 7;

  const gridWidth = useMemo(() => RANGE_DAYS * CELL + (RANGE_DAYS - 1) * GAP, [RANGE_DAYS, CELL, GAP]);

  const headerBlocks = useMemo(() => {
    const blocks: Array<{ idx: number; width: number; mr: number }> = [];
    const totalWeeks = Math.ceil(RANGE_DAYS / WEEK);

    for (let w = 0; w < totalWeeks; w++) {
      const startIdx = w * WEEK;
      const remain = RANGE_DAYS - startIdx;
      const daysInBlock = Math.min(WEEK, Math.max(0, remain));

      const width = daysInBlock * CELL + Math.max(0, daysInBlock - 1) * GAP;
      const isLast = startIdx + daysInBlock >= RANGE_DAYS;
      const mr = isLast ? 0 : GAP;

      blocks.push({ idx: startIdx, width, mr });
    }
    return blocks;
  }, [RANGE_DAYS, WEEK, CELL, GAP]);

  // ✅ 요구사항: 히트맵 사용자 리스트에서 "본인"이 최상단
  const orderedMembers = useMemo(() => {
    const arr = safeArr<Member>(members);
    if (!myUid) return arr;

    const me = arr.find((m) => m.user_id === myUid);
    const rest = arr.filter((m) => m.user_id !== myUid);

    return me ? [me, ...rest] : arr;
  }, [members, myUid]);

  // ✅ 오늘 사람별 상태 리스트(표시용)
  const todayRows = useMemo(() => {
    return orderedMembers.map((m) => {
      const st = statusMapToday.get(m.user_id) ?? null; // 'focus' | 'rest' | null
      return { m, st };
    });
  }, [orderedMembers, statusMapToday]);

  const StatusChip = useCallback(
    ({ st }: { st: 'focus' | 'rest' | null }) => {
      const isNone = !st;

      const bg =
        st === 'focus'
          ? 'rgba(76,201,255,0.10)'
          : st === 'rest'
          ? 'rgba(59,231,176,0.08)'
          : 'rgba(255,255,255,0.06)';

      const bd =
        st === 'focus'
          ? 'rgba(76,201,255,0.18)'
          : st === 'rest'
          ? 'rgba(59,231,176,0.16)'
          : 'rgba(255,255,255,0.10)';

      const fg = st === 'focus' ? BLUE : st === 'rest' ? GREEN : MUTED;
      const label = st === 'focus' ? '완료' : st === 'rest' ? '휴식' : '미체크';

      return (
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: bg,
            borderWidth: 1,
            borderColor: bd,
            minWidth: 64,
            alignItems: 'center',
          }}
        >
          <T style={{ color: fg, fontWeight: '900', fontSize: 12 }}>{label}</T>
        </View>
      );
    },
    []
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG, paddingTop: topPad }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: BG }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 18 }}
        refreshControl={<RefreshControl tintColor={BLUE} refreshing={refreshing} onRefresh={load} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header Row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
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
            <T style={{ color: MUTED, fontSize: 18, fontWeight: '900', lineHeight: 18 }}>←</T>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            {isOwner ? (
              isActive ? (
                <Pressable
                  onPress={askEnd}
                  disabled={refreshing || !isOwner}
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
                  <T style={{ color: RED, fontWeight: '900' }}>공유 종료</T>
                </Pressable>
              ) : (
                <Pressable
                  onPress={askReopen}
                  disabled={refreshing || !isOwner}
                  hitSlop={6}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    backgroundColor: 'rgba(59,231,176,0.10)',
                    borderWidth: 1,
                    borderColor: 'rgba(59,231,176,0.18)',
                    opacity: refreshing ? 0.6 : 1,
                  }}
                >
                  <T style={{ color: GREEN, fontWeight: '900' }}>다시 열기</T>
                </Pressable>
              )
            ) : null}

            <Pressable
              onPress={askLeave}
              disabled={refreshing}
              hitSlop={6}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.06)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.10)',
                opacity: refreshing ? 0.6 : 1,
              }}
            >
              <T style={{ color: MUTED, fontWeight: '900' }}>나가기</T>
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
              <T style={{ color: BLUE, fontWeight: '900' }}>공유</T>
            </Pressable>
          </View>
        </View>

        <T style={{ color: TEXT, fontSize: 22, fontWeight: '900', marginTop: 10 }}>{title}</T>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' as any }}>
          <T style={{ color: MUTED, marginTop: 6, fontWeight: '900', fontSize: 12 }}>
            참여 코드: {String((room as any)?.join_code ?? '—')} · {dayjs().format('M/D')} 기준
          </T>

          {!isActive ? (
            <View
              style={{
                marginTop: 6,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: 'rgba(255,107,107,0.10)',
                borderWidth: 1,
                borderColor: 'rgba(255,107,107,0.18)',
              }}
            >
              <T style={{ color: RED, fontWeight: '900', fontSize: 12 }}>종료됨</T>
            </View>
          ) : null}
        </View>

        {!isActive ? (
          <View
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 14,
              backgroundColor: 'rgba(255,107,107,0.08)',
              borderWidth: 1,
              borderColor: 'rgba(255,107,107,0.16)',
            }}
          >
            <T style={{ color: MUTED, lineHeight: 20 }}>
              이 공유 호흡은 종료된 상태입니다. 신규 참여/오늘 체크가 제한됩니다.
              {isOwner ? '\n방장은 “다시 열기”로 복구할 수 있습니다.' : ''}
            </T>
          </View>
        ) : null}

        {/* ✅ 닉네임 설정 */}
        <Card title="닉네임 설정" desc="이 방에서만 표시되는 닉네임입니다">
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View
              style={{
                flex: 1,
                backgroundColor: '#0F151D',
                borderWidth: 1,
                borderColor: LINE,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: Platform.OS === 'ios' ? 12 : 10,
              }}
            >
              <TI
                value={myNickInput}
                onChangeText={setMyNickInput}
                placeholder="닉네임 입력"
                placeholderTextColor="rgba(143,163,184,0.6)"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                style={{ color: TEXT, fontWeight: '900', fontSize: 14, padding: 0 }}
              />
            </View>

            <Pressable
              onPress={saveMyNickname}
              disabled={nickSaving || refreshing}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(76,201,255,0.12)',
                borderWidth: 1,
                borderColor: 'rgba(76,201,255,0.25)',
                opacity: nickSaving || refreshing ? 0.6 : 1,
              }}
            >
              <T style={{ color: BLUE, fontWeight: '900' }}>등록</T>
            </Pressable>
          </View>

          {nickSaving ? (
            <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color={BLUE} />
              <T style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>저장 중입니다…</T>
            </View>
          ) : null}
        </Card>

        {/* Today action */}
        <Card title="오늘 상태" desc={isActive ? '하루 한 번만 체크하시면 됩니다.' : '종료된 공유 호흡에서는 체크할 수 없습니다.'}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => setMyStatus('focus')} style={DoneBtnStyle} disabled={refreshing || !isActive}>
              <T style={{ color: myToday === 'focus' ? BLUE : MUTED, fontWeight: '900' }}>완료</T>
            </Pressable>

            <Pressable onPress={() => setMyStatus('rest')} style={RestBtnStyle} disabled={refreshing || !isActive}>
              <T style={{ color: myToday === 'rest' ? GREEN : MUTED, fontWeight: '900' }}>휴식</T>
            </Pressable>
          </View>

          {refreshing ? (
            <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color={BLUE} />
              <T style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>반영 중입니다…</T>
            </View>
          ) : null}
        </Card>

        {/* ✅ 오늘 팀 현황 (여기에 "각자 체크 상태" 추가) */}
        <Card title="오늘 팀 현황" desc={teamSummaryText}>
          <View
            style={{
              backgroundColor: '#0F151D',
              borderWidth: 1,
              borderColor: LINE,
              borderRadius: 16,
              padding: 14,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View>
                <T style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>오늘 체크율</T>
                <T style={{ color: TEXT, fontWeight: '900', fontSize: 28, marginTop: 6 }}>{checkRate}%</T>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <T style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>미체크 {counts.none}명</T>
                <T style={{ color: MUTED, fontWeight: '900', fontSize: 12, marginTop: 6 }}>전체 {counts.total}명</T>
              </View>
            </View>

            <View
              style={{
                height: 10,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.06)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
                marginTop: 12,
                overflow: 'hidden',
              }}
            >
              <View style={{ width: `${checkRate}%`, height: '100%', backgroundColor: 'rgba(76,201,255,0.35)' }} />
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View
                style={{
                  flex: 1,
                  borderRadius: 12,
                  paddingVertical: 10,
                  alignItems: 'center',
                  backgroundColor: 'rgba(76,201,255,0.10)',
                  borderWidth: 1,
                  borderColor: 'rgba(76,201,255,0.18)',
                }}
              >
                <T style={{ color: MUTED, fontWeight: '900', fontSize: 11 }}>완료</T>
                <T style={{ color: BLUE, fontWeight: '900', marginTop: 4 }}>{counts.focus}</T>
              </View>

              <View
                style={{
                  flex: 1,
                  borderRadius: 12,
                  paddingVertical: 10,
                  alignItems: 'center',
                  backgroundColor: 'rgba(59,231,176,0.08)',
                  borderWidth: 1,
                  borderColor: 'rgba(59,231,176,0.16)',
                }}
              >
                <T style={{ color: MUTED, fontWeight: '900', fontSize: 11 }}>휴식</T>
                <T style={{ color: GREEN, fontWeight: '900', marginTop: 4 }}>{counts.rest}</T>
              </View>

              <View
                style={{
                  flex: 1,
                  borderRadius: 12,
                  paddingVertical: 10,
                  alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.10)',
                }}
              >
                <T style={{ color: MUTED, fontWeight: '900', fontSize: 11 }}>미체크</T>
                <T style={{ color: MUTED, fontWeight: '900', marginTop: 4 }}>{counts.none}</T>
              </View>
            </View>

            {/* ✅ 추가: 오늘 사람별 체크 상태 */}
            <View
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: 'rgba(255,255,255,0.06)',
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>오늘 누가 뭘 체크했나요</T>
                <T style={{ color: MUTED, fontWeight: '900', fontSize: 11 }}>{dayjs().format('M/D')}</T>
              </View>

              <View style={{ marginTop: 10, gap: 8 }}>
                {todayRows.map(({ m, st }) => {
                  const isMe = !!myUid && m.user_id === myUid;
                  const isRoomOwner = String(m.role ?? '').toLowerCase() === 'owner';

                  return (
                    <View
                      key={`today-${m.user_id}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 14,
                        backgroundColor: isMe ? 'rgba(76,201,255,0.08)' : 'rgba(255,255,255,0.03)',
                        borderWidth: 1,
                        borderColor: isMe ? 'rgba(76,201,255,0.16)' : 'rgba(255,255,255,0.06)',
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <T numberOfLines={1} style={{ color: TEXT, fontWeight: '900', fontSize: 13 }}>
                          {displayName(m)}
                          {isRoomOwner ? ' (방장)' : ''}
                        </T>
                        {isMe ? (
                          <T style={{ color: MUTED, fontWeight: '900', fontSize: 11, marginTop: 4 }}>내 상태</T>
                        ) : null}
                      </View>

                      <StatusChip st={st} />
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        </Card>

        {/* Heatmap */}
        <Card title="최근 3주 히트맵">
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: CellColor('focus') }} />
            <T style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>완료</T>

            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: CellColor('rest') }} />
            <T style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>휴식</T>

            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: CellColor(undefined) }} />
            <T style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>미체크</T>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ paddingRight: 14 }}>
              <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                <View style={{ width: NAME_COL_W }} />
                <View style={{ flexDirection: 'row', width: gridWidth }}>
                  {headerBlocks.map((b, i) => {
                    const d = days[b.idx];
                    if (!d) return null;
                    return (
                      <View
                        key={`hb-${i}`}
                        style={{
                          width: b.width,
                          marginRight: b.mr,
                          justifyContent: 'center',
                          alignItems: 'flex-start',
                          height: 14,
                        }}
                      >
                        <T numberOfLines={1} style={{ color: MUTED, fontSize: 10, fontWeight: '900', lineHeight: 12 }}>
                          {dayjs(d).format('M/D')}
                        </T>
                      </View>
                    );
                  })}
                </View>
              </View>

              {orderedMembers.map((m) => {
                const isMe = !!myUid && m.user_id === myUid;

                return (
                  <View
                    key={m.user_id}
                    style={{
                      marginBottom: 4,
                      paddingVertical: isMe ? 6 : 0,
                      paddingHorizontal: isMe ? 8 : 0,
                      marginHorizontal: isMe ? -8 : 0,
                      borderRadius: 14,
                      backgroundColor: isMe ? 'rgba(76,201,255,0.08)' : 'transparent',
                      borderWidth: isMe ? 1 : 0,
                      borderColor: isMe ? 'rgba(76,201,255,0.16)' : 'transparent',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: NAME_COL_W, paddingRight: 6, justifyContent: 'center' }}>
                        <T
                          numberOfLines={1}
                          ellipsizeMode="middle"
                          style={{
                            color: TEXT,
                            fontWeight: '900',
                            fontSize: 12,
                            lineHeight: CELL + 6,
                            paddingVertical: 2,
                          }}
                        >
                          {displayName(m)}
                          {String(m.role ?? '').toLowerCase() === 'owner' ? ' (방장)' : ''}
                        </T>
                      </View>

                      <View style={{ flexDirection: 'row', width: gridWidth, height: CELL, alignItems: 'center' }}>
                        {days.map((d, idx) => {
                          const st = statusMapRange.get(`${m.user_id}|${d}`);
                          const isToday = d === todayKey;

                          return (
                            <View
                              key={`${m.user_id}-${d}`}
                              style={{
                                width: isToday ? CELL + 2 : CELL,
                                height: isToday ? CELL + 2 : CELL,
                                marginRight: idx === days.length - 1 ? 0 : GAP,
                                borderRadius: 3,
                                backgroundColor: CellColor(st),
                                opacity: isToday ? 1 : 0.9,
                                ...(isToday && {
                                  shadowColor: CellColor(st),
                                  shadowOpacity: 0.6,
                                  shadowRadius: 3,
                                  shadowOffset: { width: 0, height: 0 },
                                  elevation: 2,
                                }),
                              }}
                            />
                          );
                        })}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </Card>

        <View style={{ height: 18 }} />
      </ScrollView>
    </View>
  );
}
