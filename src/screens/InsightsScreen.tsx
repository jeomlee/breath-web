// src/screens/InsightsScreen.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text as RNText,
  ScrollView,
  Alert,
  Pressable,
  DeviceEventEmitter,
  RefreshControl,
  type TextProps,
  type EmitterSubscription,
} from 'react-native';
import dayjs from 'dayjs';
import { supabase } from '../api/supabaseClient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { InsightsStackParamList } from '../navigation/types';
import ScreenContainer from '../components/ScreenContainer';

/* =========================
   ✅ Text wrapper: 시스템 폰트 스케일 차단
========================= */
function T(props: TextProps) {
  return <RNText {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}

/* =========================
   Types
========================= */
type Routine = {
  id: string;
  title: string;
  sort_order: number;
  is_active: boolean;
  group_key: string | null;
};

type DailyLogRow = {
  date_key: string;
  routine_id: string | null;
  status: 'done' | 'rest';
};

type FocusSessionRow = {
  id: string;
  user_id: string;
  mode: 'focus' | 'rest' | null;
  started_at: string;
  ended_at: string | null;
  planned_seconds: number | null;
  focused_seconds: number | null;
};

type InsightsSettings = {
  color_mode: 'log' | 'session_ratio';
};

const SETTINGS_CHANGED_EVENT = 'settingsChanged';

// ✅ 앱 전역 이벤트(추가/삭제 즉시 반영용)
const ROUTINE_CREATED_EVENT = 'ROUTINE_CREATED';
const ROUTINE_DELETED_EVENT = 'ROUTINE_DELETED';

/* =========================
   Colors
========================= */
const BG = '#0B0F14';
const CARD = '#121A23';
const LINE = '#1E2A38';
const MUTED = '#8FA3B8';
const TEXT = '#EAF2FF';

const FOCUS = '#4CC9FF';
const REST = '#3BE7B0';
const NONE = '#6B7F96';

/* =========================
   Utils
========================= */
function hexToRgb(hex: string) {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return { r, g, b };
}
function rgba(hex: string, a: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function mixHex(a: string, b: string, t: number) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const r = Math.round(A.r + (B.r - A.r) * t);
  const g = Math.round(A.g + (B.g - A.g) * t);
  const bb = Math.round(A.b + (B.b - A.b) * t);
  return `rgb(${r},${g},${bb})`;
}
function rgbaFromRgbString(rgb: string, a: number) {
  const m = rgb.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!m) return `rgba(255,255,255,${a})`;
  return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
}
function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

/** ✅ ISO(UTC/Z 포함) → "로컬 날짜키"로 확정 */
function isoToLocalDateKey(iso: string) {
  return dayjs(new Date(iso)).format('YYYY-MM-DD');
}

function sortRoutines(list: Routine[]) {
  return [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export default function InsightsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<InsightsStackParamList>>();

  const [userId, setUserId] = useState<string | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [logs, setLogs] = useState<DailyLogRow[]>([]);
  const [sessions, setSessions] = useState<FocusSessionRow[]>([]);
  const [settings, setSettings] = useState<InsightsSettings>({ color_mode: 'log' });

  const [refreshing, setRefreshing] = useState(false);
  const tipTimer = useRef<any>(null);

  const weeks = 8;
  const days = weeks * 7;

  // ✅ “매 렌더마다 now가 바뀌는 문제”를 제거하면서도,
  //    날짜 기준은 "오늘" 기준으로 안정적으로 유지
  const todayKey = dayjs().format('YYYY-MM-DD');
  const todayText = dayjs().format('M/D');

  // ✅ 잔디 기간: 오늘 00:00 로컬 기준
  const today0 = useMemo(() => dayjs().startOf('day'), [todayKey]);
  const end = useMemo(() => today0.format('YYYY-MM-DD'), [today0]);
  const start = useMemo(() => today0.subtract(days - 1, 'day').format('YYYY-MM-DD'), [today0, days]);

  // ✅ 세션 조회 기간: 이번달~저번달 (월 단위로만 갱신)
  const monthKey = dayjs().format('YYYY-MM');
  const sessionRange = useMemo(() => {
    const m0 = dayjs().startOf('month');
    return {
      from: m0.subtract(1, 'month').startOf('day').toISOString(),
      to: dayjs().endOf('day').toISOString(),
    };
  }, [monthKey, todayKey]);

  // ✅ 잔디 알파(기본 진하기)
  const unifiedAlphaByLv = useMemo(() => [0, 0.38, 0.56, 0.74, 0.92] as const, []);
  // ✅ 세부기록 알파
  const detailNoneAlpha = 0.30;
  const detailRestAlpha = 0.48;
  const detailDoneAlpha = 0.95;

  const loadSettings = useCallback(async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('insights_color_mode')
        .eq('user_id', uid)
        .maybeSingle();

      if (error) return;
      const mode = data?.insights_color_mode;
      if (mode === 'log' || mode === 'session_ratio') setSettings({ color_mode: mode });
    } catch {}
  }, []);

  const load = useCallback(async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    setUserId(user.id);
    await loadSettings(user.id);

    const rReq = supabase
      .from('routines')
      .select('id,title,sort_order,is_active,group_key')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    const lReq = supabase
      .from('daily_logs')
      .select('date_key,routine_id,status')
      .eq('user_id', user.id)
      .gte('date_key', start)
      .lte('date_key', end);

    const sReq = supabase
      .from('focus_sessions')
      .select('id,user_id,mode,started_at,ended_at,planned_seconds,focused_seconds')
      .eq('user_id', user.id)
      .gte('started_at', sessionRange.from)
      .lte('started_at', sessionRange.to);

    const [{ data: rData, error: rErr }, { data: lData, error: lErr }, { data: sData, error: sErr }] =
      await Promise.all([rReq, lReq, sReq]);

    if (rErr) return Alert.alert('기록 불러오기 실패', rErr.message);
    if (lErr) return Alert.alert('기록 불러오기 실패', lErr.message);

    setRoutines(sortRoutines((rData as any) || []));
    setLogs((lData as any) || []);
    if (!sErr) setSessions((sData as any) || []);
    else setSessions([]);
  }, [end, loadSettings, sessionRange.from, sessionRange.to, start]);

  const onPullRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load, refreshing]);

  // ✅ 최초 로드 + 설정 변경 이벤트
  useEffect(() => {
    load();

    const sub = DeviceEventEmitter.addListener(SETTINGS_CHANGED_EVENT, (next: any) => {
      if (next?.color_mode === 'log' || next?.color_mode === 'session_ratio') {
        setSettings({ color_mode: next.color_mode });
      }
    });

    return () => {
      if (tipTimer.current) clearTimeout(tipTimer.current);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ ✅ ✅ 호흡 추가/삭제 이벤트 수신 → 인사이트 즉시 반영(가볍게)
  useEffect(() => {
    const subs: EmitterSubscription[] = [];

    subs.push(
      DeviceEventEmitter.addListener(ROUTINE_CREATED_EVENT, (created: any) => {
        // created: routines row를 select로 받아온 형태 권장
        if (!created?.id) return;

        setRoutines((prev) => {
          const filtered = prev.filter((r) => r.id !== created.id);
          return sortRoutines([...filtered, created as Routine]);
        });

        // 로그/세션은 새 루틴엔 없음 → 건드릴 필요 없음
      })
    );

    subs.push(
      DeviceEventEmitter.addListener(ROUTINE_DELETED_EVENT, (payload: any) => {
        const rid = payload?.routineId;
        if (!rid) return;

        // 1) 루틴 목록에서 즉시 제거
        setRoutines((prev) => prev.filter((r) => r.id !== rid));

        // 2) 세부기록(로그)에서도 해당 루틴 기록 제거(카드 잔디가 남는 문제 방지)
        setLogs((prev) => prev.filter((l) => l.routine_id !== rid));

        // 3) 세션은 루틴과 무관하니 유지
      })
    );

    return () => subs.forEach((s) => s.remove());
  }, []);

  // ✅ realtime(있으면 좋지만) → 너무 자주 load 되지 않도록 1회 디바운스 유지
  useEffect(() => {
    if (!userId) return;

    let t: any = null;
    const scheduleReload = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => load(), 250);
    };

    const ch = supabase
      .channel(`insights-realtime-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_logs', filter: `user_id=eq.${userId}` },
        scheduleReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'routines', filter: `user_id=eq.${userId}` },
        scheduleReload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'focus_sessions', filter: `user_id=eq.${userId}` },
        scheduleReload
      )
      .subscribe();

    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, [load, userId]);

  const dayList = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < days; i++) arr.push(dayjs(start).add(i, 'day').format('YYYY-MM-DD'));
    return arr;
  }, [start, days]);

  const intensity = useCallback((count: number) => {
    if (count <= 0) return 0;
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count === 3) return 3;
    return 4;
  }, []);

  /* =====================================================
     ✅ 전체 잔디용: 날짜별 done/rest 집계 + 비율/우점에 따른 진하기
  ===================================================== */

  // ✅ log 기반: done/rest를 "카운트"로 집계 (둘 다 동일하게 '기록'으로 취급)
  const logAggByDay = useMemo(() => {
    const byDay: Record<
      string,
      { done: number; rest: number; total: number; t: number; dominance: number; lv: number }
    > = {};
    for (const d of dayList) {
      byDay[d] = { done: 0, rest: 0, total: 0, t: 0.5, dominance: 0, lv: 0 };
    }

    for (const row of logs) {
      const d = row.date_key;
      if (!byDay[d]) continue;
      if (row.status === 'done') byDay[d].done += 1;
      else if (row.status === 'rest') byDay[d].rest += 1;
    }

    for (const d of dayList) {
      const done = byDay[d].done;
      const rest = byDay[d].rest;
      const total = done + rest;
      const t = total <= 0 ? 0.5 : done / total;
      const dominance = total <= 0 ? 0 : clamp01(Math.abs(t - 0.5) * 2);
      const lv = total <= 0 ? 0 : Math.max(1, intensity(total));
      byDay[d] = { ...byDay[d], total, t, dominance, lv };
    }

    return byDay;
  }, [dayList, logs, intensity]);

  // ✅ session 기반: focus/rest 세션 비율로 집계 (✅ 로컬 날짜키로 변환)
  const sessionAggByDay = useMemo(() => {
    const byDay: Record<
      string,
      { done: number; rest: number; total: number; t: number; dominance: number; lv: number }
    > = {};
    for (const d of dayList) {
      byDay[d] = { done: 0, rest: 0, total: 0, t: 0.5, dominance: 0, lv: 0 };
    }

    for (const s of sessions) {
      const d = isoToLocalDateKey(s.started_at);
      if (!byDay[d]) continue;
      const mode = (s.mode ?? 'focus') as 'focus' | 'rest';
      if (mode === 'rest') byDay[d].rest += 1;
      else byDay[d].done += 1;
    }

    for (const d of dayList) {
      const done = byDay[d].done;
      const rest = byDay[d].rest;
      const total = done + rest;
      const t = total <= 0 ? 0.5 : done / total;
      const dominance = total <= 0 ? 0 : clamp01(Math.abs(t - 0.5) * 2);
      const lv = total <= 0 ? 0 : Math.max(1, intensity(total));
      byDay[d] = { ...byDay[d], total, t, dominance, lv };
    }

    return byDay;
  }, [dayList, sessions, intensity]);

  const unifiedAggByDay = useMemo(() => {
    return settings.color_mode === 'session_ratio' ? sessionAggByDay : logAggByDay;
  }, [logAggByDay, sessionAggByDay, settings.color_mode]);

  const dayDoneCount = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const row of logs) {
      if (row.status !== 'done') continue;
      byDay[row.date_key] = (byDay[row.date_key] ?? 0) + 1;
    }
    return byDay;
  }, [logs]);

  const dayRestCount = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const row of logs) {
      if (row.status !== 'rest') continue;
      byDay[row.date_key] = (byDay[row.date_key] ?? 0) + 1;
    }
    return byDay;
  }, [logs]);

  const unifiedGrid = useMemo(() => {
    const cols: { date: string; doneCount: number }[][] = [];
    for (let w = 0; w < weeks; w++) {
      const col: { date: string; doneCount: number }[] = [];
      for (let r = 0; r < 7; r++) {
        const idx = w * 7 + r;
        const date = dayList[idx];
        col.push({ date, doneCount: dayDoneCount[date] ?? 0 });
      }
      cols.push(col);
    }
    return cols;
  }, [weeks, dayList, dayDoneCount]);

  const totalDone8w = useMemo(() => Object.values(dayDoneCount).reduce((a, b) => a + b, 0), [dayDoneCount]);
  const totalRest8w = useMemo(() => Object.values(dayRestCount).reduce((a, b) => a + b, 0), [dayRestCount]);

  const todayPos = useMemo(() => {
    for (let w = 0; w < unifiedGrid.length; w++) {
      const col = unifiedGrid[w];
      for (let rr = 0; rr < col.length; rr++) {
        if (col[rr].date === todayKey) return { w, rr };
      }
    }
    return null;
  }, [unifiedGrid, todayKey]);

  const routineStatusByDay = useMemo(() => {
    const map = new Map<string, Map<string, 'done' | 'rest'>>();
    for (const row of logs) {
      if (!row.routine_id) continue;
      if (row.status !== 'done' && row.status !== 'rest') continue;
      if (!map.has(row.routine_id)) map.set(row.routine_id, new Map());
      map.get(row.routine_id)!.set(row.date_key, row.status);
    }
    return map;
  }, [logs]);

  const routineComputed = useMemo(() => {
    const out = new Map<
      string,
      {
        grid: { date: string; status: 'done' | 'rest' | 'none' }[][];
        recordPercent: number;
        last7: number;
      }
    >();

    const today0Local = dayjs().startOf('day');
    const start7 = today0Local.subtract(6, 'day');

    for (const r of routines) {
      const m = routineStatusByDay.get(r.id) ?? new Map<string, 'done' | 'rest'>();

      const cols: { date: string; status: 'done' | 'rest' | 'none' }[][] = [];
      for (let w = 0; w < weeks; w++) {
        const col: { date: string; status: 'done' | 'rest' | 'none' }[] = [];
        for (let rr = 0; rr < 7; rr++) {
          const idx = w * 7 + rr;
          const date = dayList[idx];
          col.push({ date, status: m.get(date) ?? 'none' });
        }
        cols.push(col);
      }

      let recorded = 0;
      for (const d of dayList) if (m.get(d) === 'done' || m.get(d) === 'rest') recorded++;
      const recordPercent = Math.round((recorded / days) * 100);

      let l7 = 0;
      for (let i = 0; i < 7; i++) {
        const d = start7.add(i, 'day').format('YYYY-MM-DD');
        const st = m.get(d);
        if (st === 'done' || st === 'rest') l7++;
      }

      out.set(r.id, { grid: cols, recordPercent, last7: l7 });
    }

    return out;
  }, [routines, routineStatusByDay, weeks, dayList, days]);

  const routineList = useMemo(() => routines.slice(), [routines]);

  const UNIFIED_CELL = 20;
  const UNIFIED_GAP = 8;

  const todayLabel = useMemo(() => `오늘 ${todayText}`, [todayText]);

  return (
    <ScreenContainer bg={BG} barStyle="light-content">
      <ScrollView
        contentContainerStyle={{
          paddingTop: 0,
          paddingHorizontal: 12,
          paddingBottom: 18,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            tintColor={FOCUS}
            colors={[FOCUS]}
            progressBackgroundColor="#0E141C"
          />
        }
      >
        <View style={{ paddingTop: 10, paddingBottom: 18 }}>
          <T style={{ color: TEXT, fontSize: 30, fontWeight: '900' }}>인사이트</T>
        </View>

        {/* 전체 잔디 */}
        <View
          style={{
            backgroundColor: CARD,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: LINE,
            padding: 12,
          }}
        >
          <View
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: rgba('#FFFFFF', 0.08),
              padding: 12,
              minHeight: 320,
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T style={{ color: TEXT, fontSize: 14, fontWeight: '900' }}>전체 잔디</T>

              <Pressable
                onPress={() => navigation.navigate('CalendarScreen')}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor: 'rgba(76,201,255,0.16)',
                  borderWidth: 1,
                  borderColor: 'rgba(76,201,255,0.28)',
                }}
              >
                <T style={{ color: FOCUS, fontSize: 12, fontWeight: '900' }}>캘린더 보기</T>
              </Pressable>
            </View>

            <View style={{ marginTop: 14, alignItems: 'center' }}>
              <View style={{ position: 'relative', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row' }}>
                  {unifiedGrid.map((col, w) => (
                    <View key={w} style={{ marginRight: w === unifiedGrid.length - 1 ? 0 : UNIFIED_GAP }}>
                      {col.map((cell, rr) => {
                        const dateKey = cell.date;

                        const agg = unifiedAggByDay[dateKey] ?? {
                          done: 0,
                          rest: 0,
                          total: 0,
                          t: 0.5,
                          dominance: 0,
                          lv: 0,
                        };

                        const baseRgb = mixHex(REST, FOCUS, agg.t);

                        const baseAlpha = unifiedAlphaByLv[(agg.lv as 0 | 1 | 2 | 3 | 4) ?? 0] ?? 0.4;
                        const dominanceBoost = 0.55 + 0.45 * agg.dominance;
                        const alpha = Math.min(0.95, baseAlpha * dominanceBoost);

                        const bg = agg.total <= 0 ? '#1A2330' : rgbaFromRgbString(baseRgb, alpha);
                        const isToday = dateKey === todayKey;

                        return (
                          <View
                            key={`${w}-${rr}`}
                            style={{
                              width: UNIFIED_CELL,
                              height: UNIFIED_CELL,
                              borderRadius: 6,
                              backgroundColor: bg,
                              borderWidth: isToday ? 2 : 1,
                              borderColor: isToday ? TEXT : 'rgba(255,255,255,0.10)',
                              marginBottom: rr === 6 ? 0 : UNIFIED_GAP,
                            }}
                          />
                        );
                      })}
                    </View>
                  ))}
                </View>

                {todayPos && (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 7 * UNIFIED_CELL + 6 * UNIFIED_GAP + 6,
                      left: todayPos.w * (UNIFIED_CELL + UNIFIED_GAP) + UNIFIED_CELL / 2 - 30,
                      width: 60,
                      alignItems: 'center',
                    }}
                  >
                    <T style={{ color: MUTED, fontSize: 10, fontWeight: '900', opacity: 0.9 }}>{todayLabel}</T>
                  </View>
                )}
              </View>

              <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
                <T style={{ color: MUTED, fontSize: 12 }}>
                  {weeks}주 누적 완료 <T style={{ color: TEXT, fontWeight: '900' }}>{totalDone8w}</T>
                  {'  '}·{'  '}
                  휴식 <T style={{ color: TEXT, fontWeight: '900' }}>{totalRest8w}</T>
                </T>
                <T style={{ color: MUTED, fontSize: 12, marginTop: 6 }}>색은 휴식↔완료 비율에 따라 결정됩니다.</T>
              </View>
            </View>
          </View>
        </View>

        <T style={{ color: TEXT, fontSize: 14, fontWeight: '900', marginTop: 16, marginBottom: 8 }}>세부 기록</T>

        {/* 세부 기록 카드들 */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {routineList.map((r) => {
            const computed = routineComputed.get(r.id);
            const grid = computed?.grid ?? [];
            const recordPercent = computed?.recordPercent ?? 0;
            const l7 = computed?.last7 ?? 0;

            return (
              <Pressable
                key={r.id}
                onPress={() =>
                  navigation.navigate('RoutineDetail', {
                    routineId: r.id,
                    title: r.title,
                    color: FOCUS,
                  } as any)
                }
                style={{
                  width: '48.5%',
                  backgroundColor: CARD,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: LINE,
                  padding: 10,
                  marginBottom: 10,
                }}
              >
                {/* ✅ 우측 상단 디테일 힌트 */}
                <View style={{ position: 'absolute', top: 8, right: 8, opacity: 0.9 }} pointerEvents="none">
                  <T style={{ color: 'rgba(143,163,184,0.85)', fontWeight: '900' }}>{'>'}</T>
                </View>

                <T style={{ color: TEXT, fontSize: 13, fontWeight: '900', paddingRight: 14 }} numberOfLines={1}>
                  {r.title}
                </T>

                <View style={{ flexDirection: 'row', marginTop: 10, gap: 5, alignSelf: 'center' }}>
                  {grid.map((col, w) => (
                    <View key={w} style={{ gap: 5 }}>
                      {col.map((cell, rr) => {
                        let bg = '#1A2330';
                        if (cell.status === 'none') bg = rgba(NONE, detailNoneAlpha);
                        else if (cell.status === 'rest') bg = rgba(REST, detailRestAlpha);
                        else bg = rgba(FOCUS, detailDoneAlpha);

                        return (
                          <View
                            key={`${w}-${rr}`}
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 3,
                              backgroundColor: bg,
                              borderWidth: 1,
                              borderColor: 'rgba(255,255,255,0.10)',
                            }}
                          />
                        );
                      })}
                    </View>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignSelf: 'center' }}>
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: '#0E141C',
                      borderWidth: 1,
                      borderColor: LINE,
                      borderRadius: 12,
                      padding: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <T style={{ color: MUTED, fontSize: 10, fontWeight: '900', textAlign: 'center' }}>8주 기록</T>
                    <T style={{ color: TEXT, marginTop: 3, fontWeight: '900', textAlign: 'center' }}>{recordPercent}%</T>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      backgroundColor: '#0E141C',
                      borderWidth: 1,
                      borderColor: LINE,
                      borderRadius: 12,
                      padding: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <T style={{ color: MUTED, fontSize: 10, fontWeight: '900', textAlign: 'center' }}>최근 7일</T>
                    <T style={{ color: TEXT, marginTop: 3, fontWeight: '900', textAlign: 'center' }}>{l7}/7</T>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
