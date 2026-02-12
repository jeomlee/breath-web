// src/screens/ConnectSharedScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ConnectStackParamList } from '../navigation/types';
import ScreenContainer from '../components/ScreenContainer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import { supabase } from '../api/supabaseClient';
import { fetchMySharedRooms, findRoomByCode, joinRoom, type SharedRoom } from '../api/sharedRoutines';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/* =========================
   ✅ Text / TextInput wrapper
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
const GREEN = '#3BE7B0';
const RED = '#FF6B6B';

const PIN_KEY = 'shared_rooms_pins_v1';

/** ✅ 배열 방어(여기서 null/undefined 모두 제거) */
function safeArray<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function Card({
  title,
  desc,
  right,
  children,
}: any & { right?: React.ReactNode }) {
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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <T style={{ color: TEXT, fontSize: 15, fontWeight: '900' }}>{title}</T>
          {desc ? <T style={{ color: MUTED, marginTop: 6, lineHeight: 20 }}>{desc}</T> : null}
        </View>
        {right ? <View style={{ marginTop: 2 }}>{right}</View> : null}
      </View>

      <View style={{ marginTop: 12 }}>{children}</View>
    </View>
  );
}

function Pill({ label, tone }: { label: string; tone: 'blue' | 'green' | 'gray' | 'red' }) {
  const palette =
    tone === 'blue'
      ? { bg: 'rgba(76,201,255,0.12)', bd: 'rgba(76,201,255,0.22)', tx: BLUE }
      : tone === 'green'
        ? { bg: 'rgba(59,231,176,0.10)', bd: 'rgba(59,231,176,0.18)', tx: GREEN }
        : tone === 'red'
          ? { bg: 'rgba(255,107,107,0.10)', bd: 'rgba(255,107,107,0.18)', tx: RED }
          : { bg: 'rgba(255,255,255,0.06)', bd: 'rgba(255,255,255,0.10)', tx: MUTED };

  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: palette.bg,
        borderWidth: 1,
        borderColor: palette.bd,
      }}
    >
      <T style={{ color: palette.tx, fontWeight: '900', fontSize: 12 }}>{label}</T>
    </View>
  );
}

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: active ? 'rgba(76,201,255,0.12)' : 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: active ? 'rgba(76,201,255,0.24)' : 'rgba(255,255,255,0.10)',
      }}
    >
      <T style={{ color: active ? BLUE : MUTED, fontWeight: '900', fontSize: 12 }}>{label}</T>
    </Pressable>
  );
}

async function loadPins(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(PIN_KEY);
    const arr = raw ? (JSON.parse(raw) as any) : [];
    const list = Array.isArray(arr) ? arr : [];
    return list.filter((x) => typeof x === 'string');
  } catch {
    return [];
  }
}

async function savePins(ids: string[]) {
  try {
    await AsyncStorage.setItem(PIN_KEY, JSON.stringify(ids.slice(0, 200)));
  } catch {}
}

/** ✅ 참여 코드 입력 최적화: 공백/하이픈 제거 + 대문자화 */
function normalizeJoinCode(input: string) {
  return input.replace(/[\s-]/g, '').toUpperCase().slice(0, 8);
}

type FilterKey = 'all' | 'pinned' | 'owner' | 'member';

/** ✅ room id 방어 */
function roomIdOf(r: any): string {
  return String(r?.id ?? r?.room_id ?? r?.roomId ?? '');
}

/** ✅ 제목 보강(필요 시) */
async function enrichRoomTitles(rs: SharedRoom[]): Promise<SharedRoom[]> {
  try {
    const base = safeArray<SharedRoom>(rs);
    const ids = base.map((r) => roomIdOf(r)).filter((x) => x);
    if (ids.length === 0) return base;

    const { data, error } = await supabase
      .from('shared_routine_rooms')
      .select('id,routine_title')
      .in('id', ids.slice(0, 300));

    if (error || !data) return base;

    const map = new Map<string, string>();
    for (const row of safeArray<any>(data)) {
      const id = row?.id;
      const t = String(row?.routine_title ?? '').trim();
      if (id && t) map.set(String(id), t);
    }

    return base.map((r: any) => {
      const id = roomIdOf(r);
      const best = map.get(id);
      if (!best) return r;
      return { ...(r as any), routine_title: best };
    });
  } catch {
    return safeArray<SharedRoom>(rs);
  }
}

export default function ConnectSharedScreen() {
  const nav = useNavigation<NativeStackNavigationProp<ConnectStackParamList>>();
  const insets = useSafeAreaInsets();

  const [rooms, setRooms] = useState<SharedRoom[]>([]);
  const [loading, setLoading] = useState(false);

  const [joinCode, setJoinCode] = useState('');
  const joinCodeLen = joinCode.length;
  const canJoin = joinCodeLen === 8 && !loading;

  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const pinnedRef = useRef<string[]>([]);
  useEffect(() => {
    pinnedRef.current = safeArray<string>(pinnedIds);
  }, [pinnedIds]);

  const [query, setQuery] = useState('');
  const queryNorm = query.trim().toLowerCase();
  const [filter, setFilter] = useState<FilterKey>('all');

  const [activityMap, setActivityMap] = useState<Record<string, string>>({});

  const topPad = useMemo(() => Math.min(Math.max(insets.top, 8), 18), [insets.top]);
  const H = 46;

  // ✅ 핀 Alert 중복 호출 방지(롱프레스/리렌더 루프 방지 핵심)
  const pinAlertLockRef = useRef(false);

  useEffect(() => {
    (async () => {
      const pins = await loadPins();
      setPinnedIds(safeArray<string>(pins));
    })();
  }, []);

  const goShareCreate = () => nav.navigate('ShareRoutineCreate');
  const goBoard = (roomId: string, routineTitle?: string) =>
    nav.navigate('SharedRoutineBoard', { roomId, routineTitle });

  /** ✅ 오늘 활동 요약 */
  const loadActivities = useCallback(async (rsInput: SharedRoom[]) => {
    try {
      const rs = safeArray<SharedRoom>(rsInput);
      const todayKey = dayjs().format('YYYY-MM-DD');

      const next: Record<string, string> = {};

      for (const r of rs as any[]) {
        const rid = roomIdOf(r);
        if (!rid) continue;
        if (r?.is_active === false) next[rid] = '종료된 공유 호흡입니다.';
      }

      const roomIdsActive = rs
        .filter((r: any) => r?.is_active !== false)
        .map((r) => roomIdOf(r))
        .filter(Boolean);

      if (roomIdsActive.length === 0) {
        setActivityMap(next);
        return;
      }

      const { data, error } = await supabase
        .from('shared_routine_daily_status')
        .select('room_id,user_id')
        .in('room_id', roomIdsActive.slice(0, 300))
        .eq('date_key', todayKey);

      if (error) {
        setActivityMap(next);
        return;
      }

      const checkedCount = new Map<string, number>();
      for (const row of safeArray<any>(data)) {
        const rid = row?.room_id;
        if (!rid) continue;
        checkedCount.set(String(rid), (checkedCount.get(String(rid)) ?? 0) + 1);
      }

      for (const r of rs as any[]) {
        const rid = roomIdOf(r);
        if (!rid) continue;

        if (r?.is_active === false) continue;

        const total = typeof r?.total_members === 'number' ? r.total_members : 0;
        const checked = checkedCount.get(rid) ?? 0;
        const none = Math.max(0, total - checked);

        if (total <= 0) next[rid] = '참여자가 없습니다.';
        else {
          const rate = Math.max(0, Math.min(100, Math.round((checked / total) * 100)));
          if (rate === 0) next[rid] = `오늘 아직 조용해요 · 미체크 ${none}명`;
          else if (rate < 100) next[rid] = `오늘 체크율 ${rate}% · 미체크 ${none}명`;
          else next[rid] = '오늘 전원 체크 🎉';
        }
      }

      setActivityMap(next);
    } catch {
      setActivityMap({});
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rs0 = await fetchMySharedRooms();
      const base = safeArray<SharedRoom>(rs0);
      const rs = await enrichRoomTitles(base);
      setRooms(safeArray<SharedRoom>(rs));
      await loadActivities(rs);
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '불러오기에 실패하였습니다.');
      setRooms([]);
      setActivityMap({});
    } finally {
      setLoading(false);
    }
  }, [loadActivities]);

  useEffect(() => {
    load();
  }, [load]);

  const joinByCode = useCallback(async () => {
    const code = normalizeJoinCode(joinCode);
    if (code.length !== 8) return Alert.alert('안내', '참여 코드를 8자리로 입력해 주세요.');

    try {
      const room: any = await findRoomByCode(code);
      if (!room) return Alert.alert('안내', '해당 코드의 공유 호흡을 찾지 못했습니다.');
      if (room.is_active === false) return Alert.alert('안내', '종료된 공유 호흡입니다.');

      await joinRoom(room.id);
      setJoinCode('');
      await load();
      goBoard(String(room.id), undefined);
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '참여에 실패하였습니다.');
    }
  }, [joinCode, load, nav]);

  // ✅ pinnedIds 의존성 제거(안정화) + 저장까지 여기서 처리
  const togglePin = useCallback(async (rid: string) => {
    setPinnedIds((prev) => {
      const base = safeArray<string>(prev);
      const next = base.includes(rid) ? base.filter((x) => x !== rid) : [rid, ...base];
      // 저장은 비동기로 따로
      savePins(next);
      return next;
    });
  }, []);

  // ✅ Alert 중복 호출 방지 + 현재 상태(pinnedRef) 기준으로 라벨 결정
  const askPinAction = useCallback((rid: string, title: string) => {
    if (pinAlertLockRef.current) return;
    pinAlertLockRef.current = true;

    const isPinnedNow = pinnedRef.current.includes(rid);
    const actionLabel = isPinnedNow ? '고정 해제' : '고정하기';

    const unlock = () => {
      pinAlertLockRef.current = false;
    };

    // RN Alert는 dismiss 콜백이 없어서 보험으로 타임아웃도 한 번 둠
    const t = setTimeout(() => {
      unlock();
    }, 1200);

    Alert.alert(title, '원하는 작업을 선택하세요.', [
      {
        text: '취소',
        style: 'cancel',
        onPress: () => {
          clearTimeout(t);
          unlock();
        },
      },
      {
        text: actionLabel,
        onPress: async () => {
          clearTimeout(t);
          unlock();
          await togglePin(rid);
        },
      },
    ]);
  }, [togglePin]);

  /** ✅ 검색/필터 적용 */
  const filteredRooms = useMemo(() => {
    let list = safeArray<SharedRoom>(rooms) as any[];

    if (queryNorm) {
      list = list.filter((r) => {
        const t = r?.routine_title ?? r?.title ?? '';
        return String(t).toLowerCase().includes(queryNorm);
      });
    }

    if (filter === 'pinned') {
      const pset = new Set(safeArray<string>(pinnedIds));
      list = list.filter((r) => pset.has(roomIdOf(r)));
    } else if (filter === 'owner') {
      list = list.filter((r) => String(r?.my_role ?? '').toLowerCase() === 'owner');
    } else if (filter === 'member') {
      list = list.filter((r) => String(r?.my_role ?? '').toLowerCase() !== 'owner');
    }

    return list as SharedRoom[];
  }, [rooms, queryNorm, filter, pinnedIds]);

  const sortByPinned = useCallback(
    (listInput: SharedRoom[]) => {
      const list = safeArray<SharedRoom>(listInput);
      const pins = safeArray<string>(pinnedIds);
      if (pins.length === 0) return list;

      const pset = new Set(pins);

      const pinned = list.filter((r: any) => pset.has(roomIdOf(r)));
      const rest = list.filter((r: any) => !pset.has(roomIdOf(r)));

      pinned.sort((a: any, b: any) => pins.indexOf(roomIdOf(a)) - pins.indexOf(roomIdOf(b)));
      return [...pinned, ...rest];
    },
    [pinnedIds]
  );

  const combinedRooms = useMemo(() => {
    const fr = safeArray<SharedRoom>(filteredRooms);
    const owners = fr.filter((r: any) => String(r?.my_role ?? '').toLowerCase() === 'owner');
    const members = fr.filter((r: any) => String(r?.my_role ?? '').toLowerCase() !== 'owner');
    return sortByPinned([...owners, ...members]);
  }, [filteredRooms, sortByPinned]);

  const hasAny = combinedRooms.length > 0;

  const renderRoomCard = useCallback(
    (r: SharedRoom) => {
      const rr: any = r as any;
      const rid = roomIdOf(rr);
      if (!rid) return null;

      const rawTitle = rr?.routine_title ?? rr?.title ?? null;
      const title = rawTitle && String(rawTitle).trim() ? String(rawTitle) : '호흡';

      const isOwner = String(rr?.my_role ?? '').toLowerCase() === 'owner';
      const roleLabel = isOwner ? '방장' : '멤버';
      const membersCount = typeof rr?.total_members === 'number' ? rr.total_members : 0;

      const isPinned = safeArray<string>(pinnedIds).includes(rid);
      const isActive = rr?.is_active !== false;
      const activity = activityMap[rid] ?? (isActive ? '오늘 현황을 불러오는 중…' : '종료된 공유 호흡입니다.');

      return (
        <Pressable
          key={rid}
          onPress={() => goBoard(rid, title)}
          onLongPress={() => askPinAction(rid, title)}
          delayLongPress={320}
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#0C1219' : '#0F151D',
            borderWidth: 1,
            borderColor: pressed ? 'rgba(76,201,255,0.22)' : LINE,
            borderRadius: 16,
            padding: 12,
            ...(pressed ? { transform: [{ scale: 0.995 }] } : {}), // ✅ transform 키 자체를 제거
          })}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <T style={{ color: TEXT, fontWeight: '900', fontSize: 15 }} numberOfLines={1 as any}>
                {title}
              </T>

              <T
                style={{
                  color: isActive ? MUTED : 'rgba(255,107,107,0.9)',
                  marginTop: 6,
                  fontWeight: '900',
                  fontSize: 12,
                }}
                numberOfLines={1 as any}
              >
                {activity}
              </T>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' as any }}>
                <Pill label={roleLabel} tone={isOwner ? 'blue' : 'gray'} />
                <Pill label={`${membersCount}명`} tone="gray" />
                {!isActive ? <Pill label="종료됨" tone="red" /> : null}
                {isPinned ? <Pill label="고정됨" tone="blue" /> : null}
              </View>
            </View>

            <View style={{ paddingHorizontal: 2 }}>
              <T style={{ color: 'rgba(143,163,184,0.9)', fontWeight: '900', fontSize: 18 }}>→</T>
            </View>
          </View>
        </Pressable>
      );
    },
    [activityMap, pinnedIds, goBoard, askPinAction]
  );

  return (
    <ScreenContainer bg={BG} barStyle="light-content">
      <ScrollView
        style={{ flex: 1, backgroundColor: BG }}
        contentContainerStyle={{
          paddingHorizontal: 16,
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
            참여 중인 공유 호흡이 여기에 표시됩니다.
          </T>
        </View>

        {/* 빠른 시작 */}
        <Card title="빠른 시작" desc="내 호흡을 공유하거나, 코드로 바로 참여할 수 있어요.">
          <Pressable
            onPress={goShareCreate}
            style={{
              backgroundColor: 'rgba(76,201,255,0.16)',
              borderWidth: 1,
              borderColor: 'rgba(76,201,255,0.25)',
              borderRadius: 14,
              height: 46,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <T style={{ color: BLUE, fontWeight: '900' }}>내 호흡 공유하기</T>
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 10 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: LINE, opacity: 0.8 }} />
            <T style={{ color: MUTED, fontWeight: '900', fontSize: 12, marginHorizontal: 10 }}>또는</T>
            <View style={{ flex: 1, height: 1, backgroundColor: LINE, opacity: 0.8 }} />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View
              style={{
                flex: 1,
                backgroundColor: '#0F151D',
                borderWidth: 1,
                borderColor: LINE,
                borderRadius: 14,
                height: 46,
                paddingHorizontal: 12,
                justifyContent: 'center',
              }}
            >
              <TI
                value={joinCode}
                onChangeText={(t) => setJoinCode(normalizeJoinCode(t))}
                placeholder="참여 코드 (8자리)"
                placeholderTextColor="#4A5A70"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={8}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (canJoin) joinByCode();
                  else Alert.alert('안내', '참여 코드를 8자리로 입력해 주세요.');
                }}
                textContentType={Platform.OS === 'ios' ? ('oneTimeCode' as any) : undefined}
                autoComplete={Platform.OS === 'android' ? ('one-time-code' as any) : undefined}
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
              disabled={!canJoin}
              style={{
                width: 104,
                height: 46,
                backgroundColor: canJoin ? BLUE : 'rgba(76,201,255,0.25)',
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: loading ? 0.7 : 1,
              }}
            >
              <T style={{ color: '#001018', fontWeight: '900' }}>참여하기</T>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
            <T style={{ color: MUTED, fontSize: 12, lineHeight: 18 }}>
              {!joinCodeLen
                ? '8자리 코드를 붙여넣어도 됩니다.'
                : joinCodeLen < 8
                  ? `${joinCodeLen}/8 · 조금만 더 입력해 주세요.`
                  : '준비 완료 · “참여하기”를 누르세요.'}
            </T>
            <T style={{ color: MUTED, fontSize: 12, fontWeight: '900' }}>{joinCodeLen}/8</T>
          </View>
        </Card>

        {/* 참여 중 */}
        <Card
          title="참여 중인 공유 호흡"
          right={<T style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>{combinedRooms.length}개</T>}
        >
          <View
            style={{
              backgroundColor: '#0F151D',
              borderWidth: 1,
              borderColor: LINE,
              borderRadius: 14,
              paddingHorizontal: 12,
              height: H,
              justifyContent: 'center',
            }}
          >
            <TI
              value={query}
              onChangeText={setQuery}
              placeholder="방 제목 검색"
              placeholderTextColor="#4A5A70"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={{ color: TEXT, fontWeight: '900', paddingVertical: 0 }}
            />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap' as any, gap: 8, marginTop: 10 }}>
            <FilterPill label="전체" active={filter === 'all'} onPress={() => setFilter('all')} />
            <FilterPill label="📌 고정" active={filter === 'pinned'} onPress={() => setFilter('pinned')} />
            <FilterPill label="방장" active={filter === 'owner'} onPress={() => setFilter('owner')} />
            <FilterPill label="멤버" active={filter === 'member'} onPress={() => setFilter('member')} />
          </View>

          {/* ✅ 추가: 롱프레스 안내 문구 */}
          <T style={{ color: MUTED, fontSize: 12, marginTop: 10, lineHeight: 18 }}>
            팁 · 방 카드를 길게 누르면 📌 고정/해제를 할 수 있어요.
          </T>

          {!hasAny ? (
            <View style={{ marginTop: 12 }}>
              <T style={{ color: MUTED }}>조건에 맞는 공유 호흡이 없습니다.</T>

              <Pressable
                onPress={goShareCreate}
                style={{
                  marginTop: 12,
                  backgroundColor: 'rgba(76,201,255,0.10)',
                  borderWidth: 1,
                  borderColor: 'rgba(76,201,255,0.20)',
                  borderRadius: 14,
                  height: H,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <T style={{ color: BLUE, fontWeight: '900' }}>내 호흡 공유하기</T>
              </Pressable>
            </View>
          ) : (
            <View style={{ marginTop: 12, gap: 10 }}>
              {safeArray<SharedRoom>(combinedRooms).map(renderRoomCard)}
            </View>
          )}
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}
