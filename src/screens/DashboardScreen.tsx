// src/screens/DashboardScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import {
  View,
  Text as RNText,
  Pressable,
  Alert,
  DeviceEventEmitter,
  RefreshControl,
  type TextProps,
  FlatList,
  type ListRenderItem,
} from 'react-native';
import dayjs from 'dayjs';
import { supabase } from '../api/supabaseClient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { DashboardStackParamList } from '../AppNavigator';
import ScreenContainer from '../components/ScreenContainer';
import {
  fetchDailyLogs,
  upsertDailyLog,
  deleteDailyLog,
  type DailyLogRow,
  type DailyStatus,
} from '../api/dailyLogs';

/** ✅ 시스템 글씨 크기 영향 차단용 Text 래퍼 */
function T(props: TextProps) {
  return <RNText {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}

const COLORS = {
  BG: '#0B0F14',
  CARD: '#121A23',
  LINE: '#1E2A38',
  TEXT: '#EAF2FF',
  MUTED: '#8FA3B8',

  DONE: '#4CC9FF',
  DONE_BG: 'rgba(76,201,255,0.18)',

  REST: '#3BE7B0',
  REST_BG: 'rgba(59,231,176,0.18)',

  NONE: '#6B7F96',
  NONE_BG: 'rgba(107,127,150,0.16)',
};

type Routine = {
  id: string;
  title: string;
  sort_order: number;
  is_active: boolean;
  group_key: string | null;
};

export const SETTINGS_CHANGED_EVENT = 'settingsChanged';

type InsightsSettings = {
  color_mode: 'log' | 'session_ratio';
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const StatBox = memo(function StatBox({
  label,
  percent,
  count,
  color,
}: {
  label: string;
  percent: number;
  count: number;
  color: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0E141C',
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        borderColor: COLORS.LINE,
      }}
    >
      <T style={{ color: COLORS.MUTED, fontWeight: '900', fontSize: 12 }}>{label}</T>
      <T style={{ color, fontWeight: '900', fontSize: 20, marginTop: 6 }}>{percent}%</T>
      <T style={{ color: COLORS.MUTED, marginTop: 4, fontWeight: '900' }}>{count}개</T>
    </View>
  );
});

export default function DashboardScreen() {
  const nav = useNavigation<NativeStackNavigationProp<DashboardStackParamList>>();

  const [userId, setUserId] = useState('');
  const userIdRef = useRef<string>(''); // ✅ 재조회 방지

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [todayLogs, setTodayLogs] = useState<DailyLogRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const [insightsSettings, setInsightsSettings] = useState<InsightsSettings>({
    color_mode: 'log',
  });

  // ✅ 세션 합계만 (RPC 결과)
  const [focusSeconds, setFocusSeconds] = useState(0);
  const [restSeconds, setRestSeconds] = useState(0);

  const todayKey = useMemo(() => dayjs().format('YYYY-MM-DD'), []);
  const startOfDayISO = useMemo(() => dayjs().startOf('day').toISOString(), []);
  const endOfDayISO = useMemo(() => dayjs().startOf('day').add(1, 'day').toISOString(), []);

  const savingRef = useRef<Record<string, boolean>>({});
  const bulkRef = useRef(false);

  const loadSettings = useCallback(async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('insights_color_mode')
        .eq('user_id', uid)
        .maybeSingle();

      if (error) return;

      const mode = data?.insights_color_mode as InsightsSettings['color_mode'] | undefined;
      if (mode === 'log' || mode === 'session_ratio') {
        setInsightsSettings({ color_mode: mode });
      }
    } catch {
      // ignore
    }
  }, []);

  const saveSettings = useCallback(
    async (patch: Partial<InsightsSettings>) => {
      if (!userIdRef.current) return;

      const next: InsightsSettings = { ...insightsSettings, ...patch };
      setInsightsSettings(next);

      try {
        const payload = {
          user_id: userIdRef.current,
          insights_color_mode: next.color_mode,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase.from('user_settings').upsert(payload as any, {
          onConflict: 'user_id',
        });

        if (error) {
          Alert.alert('설정 저장 실패', error.message);
          return;
        }

        DeviceEventEmitter.emit(SETTINGS_CHANGED_EVENT, next);
      } catch (e: any) {
        Alert.alert('설정 저장 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
      }
    },
    [insightsSettings]
  );

  /**
   * ✅ 성능 개선
   * - 유저 조회 1회 캐시
   * - routines / logs / settings / sessionSum 병렬 실행
   * - sessionSum은 RPC로 합계만 가져오기 (focus_sessions row 조회 제거)
   *
   * ⚠️ Supabase에 아래 RPC가 있어야 함:
   * public.get_focus_rest_sum(p_user_id uuid, p_start timestamptz, p_end timestamptz)
   * returns (focus_seconds bigint, rest_seconds bigint)
   * 내부에서 duration_sec 사용
   */
  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      if (!silent) setLoading(true);

      try {
        // ✅ user 캐시
        let uid = userIdRef.current;
        if (!uid) {
          const user = (await supabase.auth.getUser()).data.user;
          if (!user) return;
          uid = user.id;
          userIdRef.current = uid;
          setUserId(uid);
        }

        const routinesPromise = supabase
          .from('routines')
          .select('id,title,sort_order,is_active,group_key')
          .eq('user_id', uid)
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        const logsPromise = fetchDailyLogs({ userId: uid, dateKey: todayKey });

        const settingsPromise = loadSettings(uid);

        // ✅ RPC: focus/rest 합계만
        const sumPromise = supabase.rpc('get_focus_rest_sum', {
          p_user_id: uid,
          p_start: startOfDayISO,
          p_end: endOfDayISO,
        });

        const [rRes, logs, sumRes] = await Promise.all([routinesPromise, logsPromise, settingsPromise, sumPromise]).then(
          (arr) => [arr[0] as any, arr[1] as any, arr[3] as any]
        );

        if (rRes.error) Alert.alert('기록 불러오기 실패', rRes.error.message);
        setRoutines((rRes.data as any) || []);
        setTodayLogs((logs as any) || []);

        if (sumRes?.error) {
          setFocusSeconds(0);
          setRestSeconds(0);
        } else {
          // data는 보통 배열(1행)로 오지만, 환경에 따라 객체일 수도 있어 안전 처리
          const row = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
          setFocusSeconds(Number(row?.focus_seconds ?? 0));
          setRestSeconds(Number(row?.rest_seconds ?? 0));
        }
      } catch (e: any) {
        Alert.alert('데이터 불러오기 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [endOfDayISO, loadSettings, startOfDayISO, todayKey]
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await load({ silent: true });
    } finally {
      setRefreshing(false);
    }
  }, [load, refreshing]);

  const statusMap = useMemo(() => {
    const m = new Map<string, DailyStatus>();
    for (const row of todayLogs) m.set(row.routine_id, row.status);
    return m;
  }, [todayLogs]);

  const total = routines.length;

  const doneCount = useMemo(
    () => routines.filter((r) => statusMap.get(r.id) === 'done').length,
    [routines, statusMap]
  );
  const restCount = useMemo(
    () => routines.filter((r) => statusMap.get(r.id) === 'rest').length,
    [routines, statusMap]
  );
  const noneCount = Math.max(0, total - doneCount - restCount);

  const donePct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const restPct = total === 0 ? 0 : Math.round((restCount / total) * 100);
  const nonePct = total === 0 ? 0 : Math.max(0, 100 - donePct - restPct);

  const doneFlex = total === 0 ? 1 : clamp(doneCount / total, 0, 1);
  const noneFlex = total === 0 ? 1 : clamp(noneCount / total, 0, 1);
  const restFlex = total === 0 ? 1 : clamp(restCount / total, 0, 1);

  const focusMin = Math.round(focusSeconds / 60);
  const restMin = Math.round(restSeconds / 60);

  const allRest = useMemo(() => {
    if (total === 0) return false;
    return routines.every((r) => statusMap.get(r.id) === 'rest');
  }, [routines, statusMap, total]);

  const setStatus = useCallback(
    async (routine: Routine, status: DailyStatus) => {
      const uid = userIdRef.current;
      if (!uid) return;
      if (savingRef.current[routine.id]) return;
      savingRef.current[routine.id] = true;

      const prev = todayLogs;

      // 낙관적 업데이트
      setTodayLogs((p) => {
        const next = p.filter((x) => x.routine_id !== routine.id);
        next.push({ user_id: uid, date_key: todayKey, routine_id: routine.id, status } as any);
        return next;
      });

      try {
        const saved = await upsertDailyLog({
          userId: uid,
          dateKey: todayKey,
          routineId: routine.id,
          status,
        });

        setTodayLogs((p) => p.filter((x) => x.routine_id !== routine.id).concat(saved));
      } catch (e: any) {
        setTodayLogs(prev);
        Alert.alert('저장 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
      } finally {
        savingRef.current[routine.id] = false;
      }
    },
    [todayKey, todayLogs]
  );

  const clearStatus = useCallback(
    async (routine: Routine) => {
      const uid = userIdRef.current;
      if (!uid) return;
      if (savingRef.current[routine.id]) return;
      savingRef.current[routine.id] = true;

      const prev = todayLogs;
      setTodayLogs((p) => p.filter((x) => x.routine_id !== routine.id));

      try {
        await deleteDailyLog({
          userId: uid,
          dateKey: todayKey,
          routineId: routine.id,
        });
      } catch (e: any) {
        setTodayLogs(prev);
        Alert.alert('저장 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
      } finally {
        savingRef.current[routine.id] = false;
      }
    },
    [todayKey, todayLogs]
  );

  /**
   * ✅ 오늘은 쉬기
   * - 전부 rest로 일괄 처리
   * - 이미 전부 rest 상태면: "휴식 해제" => 오늘 로그 전부 삭제(미체크)
   */
  const toggleRestAll = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    if (bulkRef.current) return;
    bulkRef.current = true;

    try {
      if (routines.length === 0) return;

      // 1) 휴식 해제(= 전체 미체크로)
      if (allRest) {
        const prev = todayLogs;
        setTodayLogs([]);

        try {
          await Promise.all(
            routines.map((r) =>
              deleteDailyLog({
                userId: uid,
                dateKey: todayKey,
                routineId: r.id,
              }).catch(() => null)
            )
          );
        } catch (e: any) {
          setTodayLogs(prev);
          Alert.alert('휴식 해제 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
          return;
        }

        await load({ silent: true });
        return;
      }

      // 2) 오늘은 쉬기(= 전부 rest로)
      const prev = todayLogs;
      setTodayLogs(() =>
        routines.map(
          (r) =>
            ({
              user_id: uid,
              date_key: todayKey,
              routine_id: r.id,
              status: 'rest',
            }) as any
        )
      );

      try {
        await Promise.all(
          routines.map((r) =>
            upsertDailyLog({
              userId: uid,
              dateKey: todayKey,
              routineId: r.id,
              status: 'rest',
            })
          )
        );
      } catch (e: any) {
        setTodayLogs(prev);
        Alert.alert('저장 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
        return;
      }

      await load({ silent: true });
    } finally {
      bulkRef.current = false;
    }
  }, [allRest, load, routines, todayKey, todayLogs]);

  /**
   * ✅ Header
   * - “오늘은 쉽니다” 버튼을 ‘오늘 기록’ 섹션 최상단으로 이동
   */
  const Header = useMemo(() => {
    return (
      <View style={{ padding: 14, paddingBottom: 12 }}>
        <T style={{ color: COLORS.TEXT, fontSize: 24, fontWeight: '900' }}>오늘 하루를 기록해 볼까요</T>
        <T style={{ color: COLORS.MUTED, marginTop: 4 }}>
          {dayjs().format('M/D ddd')}
          {loading ? ' · 불러오는 중입니다…' : ''}
        </T>

        {/* 안내 카드 */}
        <View
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 14,
            backgroundColor: '#0E141C',
            borderWidth: 1,
            borderColor: COLORS.LINE,
          }}
        >
          <T style={{ color: COLORS.MUTED, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>
            <T style={{ color: COLORS.TEXT, fontWeight: '900' }}>오늘도 여기까지 오셨네요.</T>
            {'\n'}
            한 걸음이든, 쉬어 가는 날이든 괜찮습니다.
          </T>
        </View>

        {/* BALANCE */}
        <View
          style={{
            marginTop: 12,
            backgroundColor: COLORS.CARD,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: COLORS.LINE,
            padding: 14,
          }}
        >
          <T style={{ color: COLORS.TEXT, fontWeight: '900' }}>균형</T>
          <T style={{ color: COLORS.MUTED, marginTop: 6, fontSize: 12 }}>
            전체 기록({total}개) 대비 비율입니다. 미체크는 “아직 결정하지 않음”을 의미합니다.
          </T>

          <View
            style={{
              marginTop: 12,
              height: 18,
              borderRadius: 999,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: COLORS.LINE,
              backgroundColor: '#0E141C',
              flexDirection: 'row',
            }}
          >
            <View
              style={{
                flex: doneFlex,
                backgroundColor: COLORS.DONE_BG,
                borderRightWidth: doneFlex > 0 && noneFlex + restFlex > 0 ? 1 : 0,
                borderRightColor: 'rgba(30,42,56,0.8)',
              }}
            />
            <View
              style={{
                flex: noneFlex,
                backgroundColor: COLORS.NONE_BG,
                borderRightWidth: noneFlex > 0 && restFlex > 0 ? 1 : 0,
                borderRightColor: 'rgba(30,42,56,0.8)',
              }}
            />
            <View style={{ flex: restFlex, backgroundColor: COLORS.REST_BG }} />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <StatBox label="완료" percent={donePct} count={doneCount} color={COLORS.DONE} />
            <StatBox label="미체크" percent={nonePct} count={noneCount} color={COLORS.NONE} />
            <StatBox label="휴식" percent={restPct} count={restCount} color={COLORS.REST} />
          </View>

          <T style={{ color: COLORS.MUTED, marginTop: 10, fontSize: 12 }}>
            참고: 타이머 기준 완료 {focusMin}분 · 휴식 {restMin}분입니다.
          </T>
        </View>

        {/* ROUTINES HEADER */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 18,
          }}
        >
          <T style={{ color: COLORS.TEXT, fontWeight: '900' }}>오늘 기록</T>

          <Pressable
            onPress={() => nav.navigate('RoutineCreate')}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 12,
              backgroundColor: 'rgba(76,201,255,0.12)',
              borderWidth: 1,
              borderColor: 'rgba(76,201,255,0.32)',
            }}
          >
            <T style={{ color: COLORS.DONE, fontWeight: '900', fontSize: 12 }}>+ 기록</T>
          </Pressable>
        </View>

        {/* ✅ 여기! 오늘 기록 카드 최상단 */}
        <Pressable
          onPress={toggleRestAll}
          disabled={loading || routines.length === 0}
          style={{
            marginTop: 10,
            backgroundColor: allRest ? 'rgba(107,127,150,0.14)' : 'rgba(59,231,176,0.16)',
            borderWidth: 1,
            borderColor: allRest ? 'rgba(107,127,150,0.35)' : 'rgba(59,231,176,0.32)',
            paddingVertical: 12,
            borderRadius: 16,
            alignItems: 'center',
            opacity: loading || routines.length === 0 ? 0.6 : 1,
          }}
        >
          <T style={{ color: allRest ? COLORS.MUTED : COLORS.REST, fontWeight: '900' }}>
            {allRest ? '휴식을 해제합니다 (전체 미체크)' : '오늘은 쉽니다 (전체 휴식)'}
          </T>
        </Pressable>

        {routines.length === 0 ? (
          <View
            style={{
              marginTop: 10,
              backgroundColor: COLORS.CARD,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: COLORS.LINE,
              padding: 14,
            }}
          >
            <T style={{ color: COLORS.MUTED }}>아직 활성화된 기록이 없습니다.</T>
          </View>
        ) : null}
      </View>
    );
  }, [
    allRest,
    doneCount,
    doneFlex,
    donePct,
    focusMin,
    loading,
    nav,
    noneCount,
    noneFlex,
    nonePct,
    restCount,
    restFlex,
    restMin,
    restPct,
    routines.length,
    total,
    toggleRestAll,
  ]);

  const renderItem: ListRenderItem<Routine> = useCallback(
    ({ item: r }) => {
      const st = statusMap.get(r.id);
      const saving = !!savingRef.current[r.id];

      return (
        <View
          style={{
            marginHorizontal: 14,
            marginTop: 10,
            backgroundColor: COLORS.CARD,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: COLORS.LINE,
            padding: 12,
          }}
        >
          <T style={{ color: COLORS.TEXT, fontWeight: '900' }} numberOfLines={1}>
            {r.title}
          </T>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pressable
              onPress={() => setStatus(r, 'done')}
              disabled={saving}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 12,
                alignItems: 'center',
                backgroundColor: st === 'done' ? COLORS.DONE_BG : '#0E141C',
                borderWidth: 1,
                borderColor: st === 'done' ? COLORS.DONE : COLORS.LINE,
                opacity: saving ? 0.6 : 1,
              }}
            >
              <T style={{ color: st === 'done' ? COLORS.DONE : COLORS.MUTED, fontWeight: '900' }}>
                완료
              </T>
            </Pressable>

            <Pressable
              onPress={() => clearStatus(r)}
              disabled={saving}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                alignItems: 'center',
                backgroundColor: st ? COLORS.NONE_BG : 'rgba(107,127,150,0.10)',
                borderWidth: 1,
                borderColor: st ? 'rgba(107,127,150,0.35)' : COLORS.LINE,
                opacity: saving ? 0.6 : 1,
                minWidth: 52,
              }}
            >
              <T style={{ color: COLORS.MUTED, fontWeight: '900' }}>미체크</T>
            </Pressable>

            <Pressable
              onPress={() => setStatus(r, 'rest')}
              disabled={saving}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 12,
                alignItems: 'center',
                backgroundColor: st === 'rest' ? COLORS.REST_BG : '#0E141C',
                borderWidth: 1,
                borderColor: st === 'rest' ? COLORS.REST : COLORS.LINE,
                opacity: saving ? 0.6 : 1,
              }}
            >
              <T style={{ color: st === 'rest' ? COLORS.REST : COLORS.MUTED, fontWeight: '900' }}>
                휴식
              </T>
            </Pressable>
          </View>
        </View>
      );
    },
    [clearStatus, setStatus, statusMap]
  );

  return (
    <ScreenContainer bg={COLORS.BG} barStyle="light-content">
      <FlatList
        data={routines.length === 0 ? [] : routines}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.DONE}
            colors={[COLORS.DONE]}
            progressBackgroundColor="#0E141C"
          />
        }
        // ✅ 가상화/성능 옵션
        initialNumToRender={8}
        windowSize={7}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={30}
        removeClippedSubviews
      />
    </ScreenContainer>
  );
}
