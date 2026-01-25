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

  const start = useMemo(
    () => dayjs().startOf('day').subtract(days - 1, 'day').format('YYYY-MM-DD'),
    [days]
  );
  const end = useMemo(() => dayjs().startOf('day').format('YYYY-MM-DD'), []);

  const todayKey = useMemo(() => dayjs().format('YYYY-MM-DD'), []);
  const todayText = useMemo(() => dayjs().format('M/D'), []);

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
      .gte('started_at', dayjs().startOf('month').subtract(1, 'month').toISOString())
      .lte('started_at', dayjs().endOf('day').toISOString());

    const [{ data: rData, error: rErr }, { data: lData, error: lErr }, { data: sData, error: sErr }] =
      await Promise.all([rReq, lReq, sReq]);

    if (rErr) return Alert.alert('기록 불러오기 실패', rErr.message);
    if (lErr) return Alert.alert('기록 불러오기 실패', lErr.message);

    setRoutines((rData as any) || []);
    setLogs((lData as any) || []);
    if (!sErr) setSessions((sData as any) || []);
    else setSessions([]);
  }, [end, loadSettings, start]);

  const onPullRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load, refreshing]);

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
     ✅ (핵심) 전체 잔디용: 날짜별 done/rest 집계 + 비율/우점에 따른 진하기
  ===================================================== */

  // ✅ log 기반: done/rest를 "카운트"로 집계
  const logAggByDay = useMemo(() => {
    const byDay: Record<string, { done: number; rest: number; total: number; t: number; dominance: number; lv: number }> = {};
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
      const t = total <= 0 ? 0.5 : done / total; // 0=휴식쪽, 1=완료쪽
      const dominance = total <= 0 ? 0 : clamp01(Math.abs(t - 0.5) * 2); // 0(50:50)~1(한쪽만)
      const lv = total <= 0 ? 0 : Math.max(1, intensity(total)); // 활동 있으면 최소 1
      byDay[d] = { ...byDay[d], total, t, dominance, lv };
    }

    return byDay;
  }, [dayList, logs, intensity]);

  // ✅ session 기반: focus/rest 세션 비율로 집계
  const sessionAggByDay = useMemo(() => {
    const byDay: Record<string, { done: number; rest: number; total: number; t: number; dominance: number; lv: number }> = {};
    for (const d of dayList) {
      byDay[d] = { done: 0, rest: 0, total: 0, t: 0.5, dominance: 0, lv: 0 };
    }

    for (const s of sessions) {
      const d = dayjs(s.started_at).format('YYYY-MM-DD');
      if (!byDay[d]) continue;
      const mode = (s.mode ?? 'focus') as 'focus' | 'rest';
      if (mode === 'rest') byDay[d].rest += 1;
      else byDay[d].done += 1; // focus를 done 쪽으로 취급
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

  // ✅ 전체 잔디: 어떤 집계를 쓸지 선택 + 최종 색/진하기 계산에 필요한 값들
  const unifiedAggByDay = useMemo(() => {
    return settings.color_mode === 'session_ratio' ? sessionAggByDay : logAggByDay;
  }, [logAggByDay, sessionAggByDay, settings.color_mode]);

  // ✅ doneCount(표시용 요약은 기존대로: 완료 로그 기반)
  const dayDoneCount = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const row of logs) {
      if (row.status !== 'done') continue;
      byDay[row.date_key] = (byDay[row.date_key] ?? 0) + 1;
    }
    return byDay;
  }, [logs]);

  // 통합 잔디: columns
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

  const totalDone8w = useMemo(
    () => Object.values(dayDoneCount).reduce((a, b) => a + b, 0),
    [dayDoneCount]
  );

  // ✅ “오늘 셀” 위치
  const todayPos = useMemo(() => {
    for (let w = 0; w < unifiedGrid.length; w++) {
      const col = unifiedGrid[w];
      for (let rr = 0; rr < col.length; rr++) {
        if (col[rr].date === todayKey) return { w, rr };
      }
    }
    return null;
  }, [unifiedGrid, todayKey]);

  // ✅ 성능: 세부기록 계산(기존 유지)
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
        percent: number;
        last7: number;
        streak: number;
      }
    >();

    const today0 = dayjs().startOf('day');
    const start7 = today0.subtract(6, 'day');

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

      let done = 0;
      for (const d of dayList) if (m.get(d) === 'done') done++;
      const percent = Math.round((done / days) * 100);

      let l7 = 0;
      for (let i = 0; i < 7; i++) {
        const d = start7.add(i, 'day').format('YYYY-MM-DD');
        if (m.get(d) === 'done') l7++;
      }

      let st = 0;
      for (let i = 0; i < 365; i++) {
        const d = today0.subtract(i, 'day').format('YYYY-MM-DD');
        if (m.get(d) !== 'done') break;
        st++;
      }

      out.set(r.id, { grid: cols, percent, last7: l7, streak: st });
    }

    return out;
  }, [routines, routineStatusByDay, weeks, dayList, days]);

  const routineList = useMemo(() => routines.slice(), [routines]);

  // ✅ 전체 잔디 크기 2배 유지
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
        {/* 제목 */}
        <View style={{ paddingTop: 10 }}>
          <T style={{ color: TEXT, fontSize: 22, fontWeight: '900' }}>인사이트</T>
        </View>

        {/* 목표 태그 */}
        <T style={{ color: TEXT, fontSize: 14, fontWeight: '900', marginTop: 14, marginBottom: 8 }}>
          목표 태그
        </T>

        {/* ✅ 전체 잔디 카드 */}
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
            {/* 헤더 + CTA 버튼 */}
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

            {/* 잔디 */}
            <View style={{ marginTop: 14, alignItems: 'center' }}>
              <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
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

                        // ✅ 비율(t)로 색 결정(초록↔파랑)
                        const baseRgb = mixHex(REST, FOCUS, agg.t);

                        // ✅ 진하기:
                        // - 활동량(lv) 기본 알파
                        // - 우점(dominance)이 클수록 더 진하게
                        const baseAlpha = unifiedAlphaByLv[(agg.lv as 0 | 1 | 2 | 3 | 4) ?? 0] ?? 0.4;
                        const dominanceBoost = 0.55 + 0.45 * agg.dominance; // 50:50이면 0.55배, 한쪽만이면 1.0배
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

                {/* 오늘 표시(텍스트) */}
                {todayPos && (
                  <View
                    style={{
                      position: 'absolute',
                      left: todayPos.w * (UNIFIED_CELL + UNIFIED_GAP) + UNIFIED_CELL + 10,
                      top: todayPos.rr * (UNIFIED_CELL + UNIFIED_GAP) + UNIFIED_CELL / 2 - 8,
                    }}
                  >
                    <T style={{ color: MUTED, fontSize: 12, fontWeight: '900' }}>{todayLabel}</T>
                  </View>
                )}
              </View>

              {/* 요약 */}
              <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
                <T style={{ color: MUTED, fontSize: 12 }}>
                  {weeks}주 누적 완료 <T style={{ color: TEXT, fontWeight: '900' }}>{totalDone8w}</T>
                </T>
                <T style={{ color: MUTED, fontSize: 12, marginTop: 6 }}>
                  색은 휴식↔완료 비율에 따라 결정됩니다.
                </T>
              </View>
            </View>
          </View>
        </View>

        {/* 세부기록 */}
        <T style={{ color: TEXT, fontSize: 14, fontWeight: '900', marginTop: 16, marginBottom: 8 }}>
          세부 기록
        </T>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {routineList.map((r) => {
            const computed = routineComputed.get(r.id);
            const grid = computed?.grid ?? [];
            const p = computed?.percent ?? 0;
            const l7 = computed?.last7 ?? 0;
            const st = computed?.streak ?? 0;

            return (
              <Pressable
                key={r.id}
                onPress={() =>
                  navigation.navigate('RoutineDetail', {
                    routineId: r.id,
                    title: r.title,
                    color: FOCUS,
                  })
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
                <T style={{ color: TEXT, fontSize: 13, fontWeight: '900' }} numberOfLines={1}>
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
                    }}
                  >
                    <T style={{ color: MUTED, fontSize: 10, fontWeight: '900' }}>8주 달성률</T>
                    <T style={{ color: TEXT, marginTop: 3, fontWeight: '900' }}>{p}%</T>
                  </View>
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: '#0E141C',
                      borderWidth: 1,
                      borderColor: LINE,
                      borderRadius: 12,
                      padding: 8,
                    }}
                  >
                    <T style={{ color: MUTED, fontSize: 10, fontWeight: '900' }}>최근 7일</T>
                    <T style={{ color: TEXT, marginTop: 3, fontWeight: '900' }}>{l7}/7</T>
                  </View>
                </View>

                <T style={{ color: MUTED, fontSize: 11, marginTop: 8 }}>
                  연속 기록: <T style={{ color: TEXT, fontWeight: '900' }}>{st}</T>일
                </T>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
