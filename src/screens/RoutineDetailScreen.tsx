// src/screens/RoutineDetailScreen.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  DeviceEventEmitter,
} from 'react-native';
import { useRoute, useNavigation, CommonActions } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import dayjs from 'dayjs';
import { Calendar } from 'react-native-calendars';

import { supabase } from '../api/supabaseClient';
import type { InsightsStackParamList } from '../navigation/types';

type DailyStatus = 'done' | 'rest';
type DailyLogRow = {
  date_key: string;
  routine_id: string | null;
  status: DailyStatus;
};

const BG = '#0B0F14';
const CARD = '#121A23';
const LINE = '#1E2A38';
const MUTED = '#8FA3B8';
const TEXT = '#EAF2FF';

const FOCUS = '#4CC9FF'; // 완료
const REST = '#3BE7B0'; // 휴식
const UNCHECK = '#1A2330'; // 미체크(기본)

function TrendBadge({
  label,
  diffPct,
  accent,
}: {
  label: string;
  diffPct: number; // +: ▲, -: ▼
  accent: string;
}) {
  const up = diffPct > 0;
  const down = diffPct < 0;
  const arrow = up ? '▲' : down ? '▼' : '—';
  const shown = Math.abs(diffPct);

  const toneBg = up
    ? 'rgba(76,201,255,0.10)'
    : down
    ? 'rgba(59,231,176,0.08)'
    : 'rgba(255,255,255,0.06)';
  const toneBorder = up
    ? 'rgba(76,201,255,0.25)'
    : down
    ? 'rgba(59,231,176,0.22)'
    : LINE;

  return (
    <View
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: toneBorder,
        backgroundColor: toneBg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <Text style={{ color: MUTED, fontSize: 11, fontWeight: '900' }}>{label}</Text>
      <Text style={{ color: accent, fontSize: 11, fontWeight: '900' }}>
        {arrow} {shown}%
      </Text>
    </View>
  );
}

export default function RoutineDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<InsightsStackParamList, 'RoutineDetail'>>();
  const { routineId } = route.params;

  const [title, setTitle] = useState<string>('호흡');
  const [logs, setLogs] = useState<DailyLogRow[]>([]);
  const [savingToday, setSavingToday] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const bootedRef = useRef(false);

  // ✅ 공유 여부(공유 루틴이면 이 화면에서 삭제 금지)
  const [isShared, setIsShared] = useState<boolean>(false);
  const [sharedRoomId, setSharedRoomId] = useState<string | null>(null);
  const [checkingShared, setCheckingShared] = useState<boolean>(true);

  // ✅ 히트맵 범위
  const weeks = 12;
  const days = weeks * 7; // 84
  const heatStart = dayjs().startOf('day').subtract(days - 1, 'day').format('YYYY-MM-DD');
  const heatEnd = dayjs().startOf('day').format('YYYY-MM-DD');

  // ✅ 캘린더 범위
  const calStart = dayjs().startOf('month').subtract(7, 'day').format('YYYY-MM-DD');
  const calEnd = dayjs().endOf('month').add(7, 'day').format('YYYY-MM-DD');

  // ✅ "항상 인사이트 홈으로" 뒤로가기 (스택을 루트로 reset)
  const goInsightsHome = useCallback(() => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'InsightsHome' }],
      })
    );
  }, [navigation]);

  // ✅ routine title을 routineId 기반으로 매번 로드
  const loadRoutineTitle = useCallback(async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const { data, error } = await supabase
      .from('routines')
      .select('title')
      .eq('user_id', user.id)
      .eq('id', routineId)
      .maybeSingle();

    if (error) return;
    const t = (data?.title ?? '').trim();
    if (t) setTitle(t);
    else setTitle('호흡');
  }, [routineId]);

  // ✅ 이 루틴이 공유방에 연결되어 있는지 확인
  //    - shared_routine_rooms에 routine_id가 있으면 "공유 루틴"
  //    - owner가 아니더라도 조회가 가능하도록 RLS를 구성해두는 게 베스트
  const loadIsShared = useCallback(async () => {
    setCheckingShared(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('shared_routine_rooms')
        .select('id')
        .eq('routine_id', routineId)
        .limit(1);

      if (error) {
        // 공유 여부를 못 읽는 환경이면 "안전하게 공유로 간주" (삭제 막기)
        setIsShared(true);
        setSharedRoomId(null);
        return;
      }

      const roomId = (data && data.length > 0 ? data[0]?.id : null) as any;
      setIsShared(!!roomId);
      setSharedRoomId(roomId ?? null);
    } finally {
      setCheckingShared(false);
    }
  }, [routineId]);

  const load = useCallback(async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const start = dayjs(heatStart).isBefore(calStart) ? heatStart : calStart;
    const end = dayjs(heatEnd).isAfter(calEnd) ? heatEnd : calEnd;

    const { data, error } = await supabase
      .from('daily_logs')
      .select('date_key,routine_id,status')
      .eq('user_id', user.id)
      .eq('routine_id', routineId)
      .in('status', ['done', 'rest'])
      .gte('date_key', start)
      .lte('date_key', end);

    if (error) return Alert.alert('불러오기 실패', error.message);
    setLogs((data as any) || []);
  }, [routineId, heatStart, heatEnd, calStart, calEnd]);

  useEffect(() => {
    (async () => {
      if (!bootedRef.current) bootedRef.current = true;
      await loadRoutineTitle();
      await load();
      await loadIsShared(); // ✅ 추가
    })();
  }, [load, loadRoutineTitle, loadIsShared]);

  // ✅ date -> status
  const statusByDate = useMemo(() => {
    const m = new Map<string, DailyStatus>();
    for (const row of logs) {
      if (!row.date_key) continue;
      m.set(row.date_key, row.status);
    }
    return m;
  }, [logs]);

  // ✅ 84일 dayList
  const dayList = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < days; i++) arr.push(dayjs(heatStart).add(i, 'day').format('YYYY-MM-DD'));
    return arr;
  }, [heatStart, days]);

  // ✅ 최근 7일 dayList
  const dayList7 = useMemo(() => {
    const start7 = dayjs().startOf('day').subtract(6, 'day');
    const arr: string[] = [];
    for (let i = 0; i < 7; i++) arr.push(start7.add(i, 'day').format('YYYY-MM-DD'));
    return arr;
  }, []);

  const calcStats = useCallback(
    (list: string[]) => {
      let done = 0;
      let rest = 0;
      let uncheck = 0;

      for (const d of list) {
        const st = statusByDate.get(d);
        if (st === 'done') done++;
        else if (st === 'rest') rest++;
        else uncheck++;
      }

      const total = list.length;
      const focusPct = total <= 0 ? 0 : Math.round((done / total) * 100);
      const restPct = total <= 0 ? 0 : Math.round((rest / total) * 100);
      const uncheckPct = total <= 0 ? 0 : Math.max(0, 100 - focusPct - restPct);

      return { done, rest, uncheck, total, focusPct, restPct, uncheckPct };
    },
    [statusByDate]
  );

  const stats84 = useMemo(() => calcStats(dayList), [calcStats, dayList]);
  const stats7 = useMemo(() => calcStats(dayList7), [calcStats, dayList7]);
  const stats = stats84;

  // ✅ 트렌드: 7일 - 84일
  const diffFocus = useMemo(() => stats7.focusPct - stats84.focusPct, [stats7.focusPct, stats84.focusPct]);
  const diffRest = useMemo(() => stats7.restPct - stats84.restPct, [stats7.restPct, stats84.restPct]);

  // ✅ 왼쪽 카드 비율바: 완료 → 미체크 → 휴식
  const bar = useMemo(() => {
    const total = Math.max(1, stats.total);
    const f = stats.done / total;
    const u = stats.uncheck / total;
    const r = Math.max(0, 1 - f - u);
    return { f, r, u };
  }, [stats.done, stats.uncheck, stats.total]);

  // ✅ 히트맵 grid
  const heatGrid = useMemo(() => {
    const cols: { date: string; status: 'done' | 'rest' | 'none' }[][] = [];
    for (let w = 0; w < weeks; w++) {
      const col: { date: string; status: 'done' | 'rest' | 'none' }[] = [];
      for (let r = 0; r < 7; r++) {
        const idx = w * 7 + r;
        const date = dayList[idx];
        const st = statusByDate.get(date) ?? 'none';
        col.push({ date, status: st });
      }
      cols.push(col);
    }
    return cols;
  }, [weeks, dayList, statusByDate]);

  // ✅ 캘린더 마킹
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    for (const d of dayList) {
      const st = statusByDate.get(d);
      if (st === 'done') marks[d] = { selected: true, selectedColor: FOCUS, selectedTextColor: BG };
      else if (st === 'rest') marks[d] = { selected: true, selectedColor: REST, selectedTextColor: BG };
    }
    return marks;
  }, [dayList, statusByDate]);

  const guidance = useMemo(() => {
    if (stats.done + stats.rest <= 0) {
      return { tone: 'neutral' as const, title: '기록이 없습니다.', body: '아무것도 체크하지 않은 날은 “미체크”로 남습니다.' };
    }
    if (stats.focusPct >= 80) {
      return { tone: 'overheat' as const, title: '완료 비중이 높습니다.', body: '흐름이 좋습니다. 과열되기 전에 휴식을 한 번 섞어두면 더 오래 갑니다.' };
    }
    if (stats.restPct >= 70) {
      return { tone: 'loose' as const, title: '휴식 비중이 높습니다.', body: '휴식도 유지의 일부입니다. 오늘은 5분만 “시작”으로 연결해 보세요.' };
    }
    return { tone: 'ok' as const, title: '균형이 좋습니다.', body: '완료/휴식이 같이 쌓이고 있습니다. 지금 흐름 그대로만 가도 충분합니다.' };
  }, [stats.done, stats.rest, stats.focusPct, stats.restPct]);

  const guideAccent = useMemo(() => {
    if (guidance.tone === 'overheat') return 'rgba(76,201,255,0.22)';
    if (guidance.tone === 'loose') return 'rgba(59,231,176,0.18)';
    return 'rgba(255,255,255,0.10)';
  }, [guidance.tone]);

  const guideBorder = useMemo(() => {
    if (guidance.tone === 'overheat') return 'rgba(76,201,255,0.35)';
    if (guidance.tone === 'loose') return 'rgba(59,231,176,0.28)';
    return LINE;
  }, [guidance.tone]);

  const todayKey = useMemo(() => dayjs().format('YYYY-MM-DD'), []);
  const todayStatus = useMemo(() => statusByDate.get(todayKey) ?? null, [statusByDate, todayKey]);

  /**
   * ✅✅✅ 저장 로직
   */
  const saveToday = useCallback(
    async (status: DailyStatus) => {
      if (savingToday) return;

      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      setSavingToday(true);

      setLogs((prev) => {
        const next = [...prev];
        const idx = next.findIndex((r) => r.date_key === todayKey && r.routine_id === routineId);
        if (idx >= 0) next[idx] = { ...next[idx], status };
        else next.push({ date_key: todayKey, routine_id: routineId, status });
        return next;
      });

      try {
        const payload = { user_id: user.id, date_key: todayKey, routine_id: routineId, status };

        const up = await supabase
          .from('daily_logs')
          .upsert(payload as any, { onConflict: 'user_id,routine_id,date_key' })
          .select('date_key,routine_id,status');

        if (up.error) {
          const upd = await supabase
            .from('daily_logs')
            .update({ status })
            .match({ user_id: user.id, routine_id: routineId, date_key: todayKey })
            .select('date_key,routine_id,status');

          if (upd.error) {
            const ins = await supabase.from('daily_logs').insert(payload as any);
            if (ins.error) throw ins.error;
          } else {
            const updatedCount = Array.isArray(upd.data) ? upd.data.length : 0;
            if (updatedCount === 0) {
              const ins = await supabase.from('daily_logs').insert(payload as any);
              if (ins.error) throw ins.error;
            }
          }
        }
      } catch (e: any) {
        Alert.alert('저장 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
        await load();
      } finally {
        await load();
        setSavingToday(false);
      }
    },
    [savingToday, todayKey, routineId, load]
  );

  /**
   * ✅ 하드 삭제(개인 루틴에서만)
   * - 공유 루틴이면 여기서 삭제 금지 (공유 호흡 화면에서만)
   * - DB FK ON DELETE CASCADE 세팅되어 있으면 관련 데이터는 자동 삭제
   */
  const doDelete = useCallback(async () => {
    if (deleting) return;

    if (checkingShared) {
      return Alert.alert('잠시만요', '공유 여부를 확인 중입니다.');
    }

    if (isShared) {
      return Alert.alert(
        '공유 중인 루틴입니다',
        '공유 호흡 화면에서만 삭제할 수 있습니다.',
        [
          { text: '확인' },
          // 네 앱에 공유 호흡 화면 라우트가 있으면 여기로 보내도 됨.
          // { text: '이동', onPress: () => navigation.navigate('SharedBreathRoom', { roomId: sharedRoomId }) },
        ]
      );
    }

    Alert.alert(
      '삭제하시겠습니까?',
      '삭제하면 기록까지 모두 삭제됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            const user = (await supabase.auth.getUser()).data.user;
            if (!user) return;

            setDeleting(true);
            try {
              const { error } = await supabase
                .from('routines')
                .delete()
                .eq('user_id', user.id)
                .eq('id', routineId);

              if (error) throw error;

              DeviceEventEmitter.emit('ROUTINE_DELETED', { routineId });
              DeviceEventEmitter.emit('ROUTINES_CHANGED');

              goInsightsHome();
            } catch (e: any) {
              Alert.alert('삭제 실패', e?.message ?? '알 수 없는 오류가 발생했습니다.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  }, [deleting, routineId, goInsightsHome, isShared, checkingShared, sharedRoomId]);

  const androidTopPad = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: BG, paddingTop: androidTopPad }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 24 }}>
          {/* 헤더 */}
          <View style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Pressable
                onPress={goInsightsHome}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 14,
                  backgroundColor: CARD,
                  borderWidth: 1,
                  borderColor: LINE,
                  minWidth: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: MUTED, fontWeight: '900' }}>←</Text>
              </Pressable>

              <Text
                style={{ color: TEXT, fontSize: 16, fontWeight: '900', flex: 1, textAlign: 'center' }}
                numberOfLines={1}
              >
                {title}
              </Text>

              {/* ✅ 우측 상단: 삭제 (공유 루틴이면 비활성) */}
              <Pressable
                onPress={doDelete}
                disabled={deleting || checkingShared || isShared}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 14,
                  backgroundColor: isShared ? 'rgba(255,255,255,0.06)' : 'rgba(255,99,132,0.10)',
                  borderWidth: 1,
                  borderColor: isShared ? LINE : 'rgba(255,99,132,0.24)',
                  minWidth: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: deleting || checkingShared || isShared ? 0.55 : 1,
                }}
              >
                <Text style={{ color: isShared ? MUTED : 'rgba(255,99,132,0.95)', fontWeight: '900' }}>
                  {checkingShared ? '…' : deleting ? '…' : isShared ? '공유중' : '삭제'}
                </Text>
              </Pressable>
            </View>

            {/* ✅ 공유 루틴 안내(옵션) */}
            {isShared && (
              <View style={{ marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: LINE }}>
                <Text style={{ color: MUTED, fontSize: 12, lineHeight: 18 }}>
                  이 루틴은 <Text style={{ color: TEXT, fontWeight: '900' }}>공유 호흡</Text>에 연결되어 있어 여기서 삭제할 수 없습니다.
                  {'\n'}공유 호흡 화면에서만 삭제할 수 있어요.
                </Text>
              </View>
            )}
          </View>

          {/* 상단 2카드 */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            {/* 왼쪽: 통계 */}
            <View
              style={{
                flex: 1,
                backgroundColor: CARD,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: LINE,
                padding: 14,
              }}
            >
              <Text style={{ color: MUTED, fontSize: 12 }}>최근 {days}일 · 통계</Text>

              <Text style={{ color: TEXT, fontSize: 14, fontWeight: '900', marginTop: 8 }}>{guidance.title}</Text>
              <Text style={{ color: MUTED, fontSize: 12, marginTop: 6, lineHeight: 18 }}>{guidance.body}</Text>

              {/* 비율바 */}
              <View
                style={{
                  marginTop: 12,
                  height: 12,
                  borderRadius: 999,
                  backgroundColor: BG,
                  borderWidth: 1,
                  borderColor: LINE,
                  overflow: 'hidden',
                  flexDirection: 'row',
                }}
              >
                <View style={{ flex: bar.f, backgroundColor: FOCUS }} />
                <View style={{ flex: bar.u, backgroundColor: UNCHECK }} />
                <View style={{ flex: bar.r, backgroundColor: REST }} />
              </View>

              <Text style={{ marginTop: 10, fontSize: 10, fontWeight: '900' }} numberOfLines={1}>
                <Text style={{ color: FOCUS }}>
                  완료 ({stats.done}) {stats.focusPct}%
                </Text>
                <Text style={{ color: MUTED }}>  ↔  </Text>
                <Text style={{ color: REST }}>
                  {stats.restPct}% ({stats.rest}) 휴식
                </Text>
              </Text>

              <Text style={{ color: MUTED, fontSize: 11, marginTop: 6 }}>
                미체크 {stats.uncheck} · {stats.uncheckPct}% · 전체 {stats.total}
              </Text>
            </View>

            {/* 오른쪽: 오늘 기록 + 7일 리듬 */}
            <View
              style={{
                flex: 1,
                backgroundColor: CARD,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: guideBorder,
                padding: 14,
                overflow: 'hidden',
                minHeight: 150,
              }}
            >
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: -40,
                  right: -40,
                  width: 120,
                  height: 120,
                  borderRadius: 999,
                  backgroundColor: guideAccent,
                }}
              />

              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <Text style={{ color: MUTED, fontSize: 12 }}>오늘</Text>
                <Text style={{ color: MUTED, fontSize: 11 }}>{todayKey}</Text>
              </View>

              <View style={{ marginTop: 8 }}>
                <Text style={{ color: TEXT, fontSize: 14, fontWeight: '900' }} numberOfLines={1}>
                  {todayStatus === 'done'
                    ? '오늘은 완료로 기록됨'
                    : todayStatus === 'rest'
                    ? '오늘은 휴식으로 기록됨'
                    : '아직 기록 없음'}
                </Text>
                <Text style={{ color: MUTED, fontSize: 11, marginTop: 4, lineHeight: 16 }}>
                  탭 한 번으로 기록합니다. 부담 없이 남겨도 됩니다.
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Pressable
                  onPress={() => saveToday('done')}
                  disabled={savingToday}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: todayStatus === 'done' ? 'rgba(76,201,255,0.65)' : LINE,
                    backgroundColor: todayStatus === 'done' ? 'rgba(76,201,255,0.18)' : '#0F1620',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: savingToday ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: FOCUS, fontWeight: '900' }}>완료</Text>
                </Pressable>

                <Pressable
                  onPress={() => saveToday('rest')}
                  disabled={savingToday}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: todayStatus === 'rest' ? 'rgba(59,231,176,0.60)' : LINE,
                    backgroundColor: todayStatus === 'rest' ? 'rgba(59,231,176,0.14)' : '#0F1620',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: savingToday ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: REST, fontWeight: '900' }}>휴식</Text>
                </Pressable>
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: MUTED, fontSize: 11, fontWeight: '900' }}>최근 7일 리듬</Text>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                  {dayList7.map((d) => {
                    const st = statusByDate.get(d);
                    const bg = st === 'done' ? FOCUS : st === 'rest' ? REST : UNCHECK;
                    return (
                      <View key={d} style={{ alignItems: 'center', width: 14 }}>
                        <View
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 3,
                            backgroundColor: bg,
                            borderWidth: 1,
                            borderColor: LINE,
                          }}
                        />
                      </View>
                    );
                  })}
                </View>

                <Text style={{ color: MUTED, fontSize: 10, marginTop: 6 }}>
                  미체크는 공백이 아니라 “유지”로 둡니다.
                </Text>
              </View>
            </View>
          </View>

          {/* 현황 */}
          <View
            style={{
              backgroundColor: CARD,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: LINE,
              padding: 14,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: TEXT, fontSize: 14, fontWeight: '900' }}>현황</Text>
            <Text style={{ color: MUTED, fontSize: 12, marginTop: 6 }}>
              {heatStart} ~ {heatEnd}
            </Text>

            <View style={{ marginTop: 12, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {heatGrid.map((col, w) => (
                  <View key={w} style={{ gap: 6 }}>
                    {col.map((cell, r) => {
                      const bg = cell.status === 'done' ? FOCUS : cell.status === 'rest' ? REST : UNCHECK;
                      return (
                        <Pressable key={`${w}-${r}`} disabled onPress={() => {}}>
                          <View
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 3,
                              backgroundColor: bg,
                              borderWidth: 1,
                              borderColor: LINE,
                              opacity: 0.95,
                            }}
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: UNCHECK, borderWidth: 1, borderColor: LINE }} />
                <Text style={{ color: MUTED, fontSize: 12, fontWeight: '900' }}>미체크</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: REST, borderWidth: 1, borderColor: LINE }} />
                <Text style={{ color: MUTED, fontSize: 12, fontWeight: '900' }}>휴식</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: FOCUS, borderWidth: 1, borderColor: LINE }} />
                <Text style={{ color: MUTED, fontSize: 12, fontWeight: '900' }}>완료</Text>
              </View>
            </View>

            <View style={{ marginTop: 14, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                <TrendBadge label="완료(7d)" diffPct={diffFocus} accent={FOCUS} />
                <TrendBadge label="휴식(7d)" diffPct={diffRest} accent={REST} />
              </View>

              <Text style={{ color: MUTED, fontSize: 10, marginTop: 8, textAlign: 'center' }}>
                최근 7일 비율이 최근 84일 평균 대비 얼마나 달라졌는지 표시합니다.
              </Text>
            </View>
          </View>

          {/* 월 캘린더 */}
          <View style={{ backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: LINE, padding: 10, marginBottom: 12 }}>
            <Calendar
              markedDates={markedDates}
              onDayPress={() => {}}
              theme={{
                backgroundColor: CARD,
                calendarBackground: CARD,
                textSectionTitleColor: MUTED,
                dayTextColor: TEXT,
                monthTextColor: TEXT,
                todayTextColor: FOCUS,
                arrowColor: FOCUS,
                textDisabledColor: '#314355',
              }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
