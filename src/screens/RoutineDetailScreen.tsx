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
  Switch,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import dayjs from 'dayjs';
import { Calendar } from 'react-native-calendars';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../api/supabaseClient';
import type { InsightsStackParamList } from '../navigation/types';

type DailyStatus = 'done' | 'rest' | 'unknown';

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

const FOCUS = '#4CC9FF';
const REST = '#3BE7B0';
const UNKNOWN = '#263444';

const CONFIRM_LOCK_KEY = 'breath_confirm_lock_enabled_v1';

function hexToRgb(hex: string) {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return { r, g, b };
}

function mixHex(a: string, b: string, t: number) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const r = Math.round(A.r + (B.r - A.r) * t);
  const g = Math.round(A.g + (B.g - A.g) * t);
  const bb = Math.round(A.b + (B.b - A.b) * t);
  return `rgb(${r},${g},${bb})`;
}

function rgbaFromRgb(rgb: string, a: number) {
  const m = rgb.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!m) return `rgba(255,255,255,${a})`;
  return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
}

export default function RoutineDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<InsightsStackParamList, 'RoutineDetail'>>();
  const { routineId, title } = route.params;

  const [logs, setLogs] = useState<DailyLogRow[]>([]);
  const [confirmLock, setConfirmLock] = useState(false);

  const bootedRef = useRef(false);

  // ✅ 히트맵 범위(기존 유지)
  const weeks = 12;
  const days = weeks * 7;
  const heatStart = dayjs().startOf('day').subtract(days - 1, 'day').format('YYYY-MM-DD');
  const heatEnd = dayjs().startOf('day').format('YYYY-MM-DD');

  // ✅ 캘린더 범위(기존 유지)
  const calStart = dayjs().startOf('month').subtract(7, 'day').format('YYYY-MM-DD');
  const calEnd = dayjs().endOf('month').add(7, 'day').format('YYYY-MM-DD');

  // ✅ 확인 잠금 시: 최근 3일만 볼 수 있게 제한
  const lockRange = useMemo(() => {
    const max = dayjs().format('YYYY-MM-DD');
    const min = dayjs().subtract(2, 'day').format('YYYY-MM-DD');
    return { min, max };
  }, []);

  const loadConfirmLock = useCallback(async () => {
    try {
      const v = await AsyncStorage.getItem(CONFIRM_LOCK_KEY);
      setConfirmLock(v === '1');
    } catch {
      setConfirmLock(false);
    }
  }, []);

  const applyConfirmLock = useCallback(async (next: boolean) => {
    setConfirmLock(next);
    try {
      await AsyncStorage.setItem(CONFIRM_LOCK_KEY, next ? '1' : '0');
    } catch {
      // ignore
    }

    Alert.alert(
      '확인 잠금',
      next
        ? '켜짐\n\n• 과거 확인이 제한됩니다\n• 최근 3일만 볼 수 있습니다'
        : '꺼짐\n\n• 과거 확인 제한이 해제됩니다'
    );
  }, []);

  const load = useCallback(async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const start = dayjs(heatStart).isBefore(calStart) ? heatStart : calStart;
    const end = dayjs(heatEnd).isAfter(calEnd) ? heatEnd : calEnd;

    // ✅ confirmLock 켜져 있으면 최근 3일만 조회
    const from = confirmLock ? lockRange.min : start;
    const to = confirmLock ? lockRange.max : end;

    const { data, error } = await supabase
      .from('daily_logs')
      .select('date_key,routine_id,status')
      .eq('user_id', user.id)
      .eq('routine_id', routineId)
      .in('status', ['done', 'rest', 'unknown'])
      .gte('date_key', from)
      .lte('date_key', to);

    if (error) return Alert.alert('불러오기 실패', error.message);
    setLogs((data as any) || []);
  }, [routineId, heatStart, heatEnd, calStart, calEnd, confirmLock, lockRange.min, lockRange.max]);

  useEffect(() => {
    (async () => {
      if (bootedRef.current) return;
      bootedRef.current = true;
      await loadConfirmLock();
    })();
  }, [loadConfirmLock]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmLock]);

  const statusByDate = useMemo(() => {
    const m = new Map<string, DailyStatus>();
    for (const row of logs) {
      if (!row.date_key) continue;
      m.set(row.date_key, row.status);
    }
    return m;
  }, [logs]);

  const doneSet = useMemo(() => {
    const set = new Set<string>();
    for (const [d, s] of statusByDate.entries()) if (s === 'done') set.add(d);
    return set;
  }, [statusByDate]);

  const restSet = useMemo(() => {
    const set = new Set<string>();
    for (const [d, s] of statusByDate.entries()) if (s === 'rest') set.add(d);
    return set;
  }, [statusByDate]);

  const unknownSet = useMemo(() => {
    const set = new Set<string>();
    for (const [d, s] of statusByDate.entries()) if (s === 'unknown') set.add(d);
    return set;
  }, [statusByDate]);

  const stats = useMemo(() => {
    const done = doneSet.size;
    const rest = restSet.size;
    const unknown = unknownSet.size;
    const total = done + rest + unknown;

    const drTotal = done + rest; // unknown 제외
    const focusPct = drTotal <= 0 ? 0 : Math.round((done / drTotal) * 100);
    const restPct = drTotal <= 0 ? 0 : Math.round((rest / drTotal) * 100);

    return { done, rest, unknown, total, focusPct, restPct };
  }, [doneSet, restSet, unknownSet]);

  const dayList = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < days; i++) arr.push(dayjs(heatStart).add(i, 'day').format('YYYY-MM-DD'));
    return arr;
  }, [heatStart, days]);

  const heatGrid = useMemo(() => {
    const cols: { date: string; status: DailyStatus | 'none' }[][] = [];
    for (let w = 0; w < weeks; w++) {
      const col: { date: string; status: DailyStatus | 'none' }[] = [];
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

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    for (const d of doneSet.values()) {
      marks[d] = { selected: true, selectedColor: FOCUS, selectedTextColor: BG };
    }
    for (const d of restSet.values()) {
      if (marks[d]) continue;
      marks[d] = { selected: true, selectedColor: REST, selectedTextColor: BG };
    }
    for (const d of unknownSet.values()) {
      if (marks[d]) continue;
      marks[d] = { marked: true, dotColor: UNKNOWN };
    }

    return marks;
  }, [doneSet, restSet, unknownSet]);

  const ratioColor = useMemo(() => {
    const drTotal = stats.done + stats.rest;
    const t = drTotal <= 0 ? 0.5 : stats.done / drTotal; // 0=REST, 1=FOCUS
    return mixHex(REST, FOCUS, t);
  }, [stats.done, stats.rest]);

  const guidance = useMemo(() => {
    const drTotal = stats.done + stats.rest;

    if (drTotal <= 0) {
      return {
        tone: 'neutral' as const,
        title: '완료/휴식 기록이 없습니다.',
        body: '확정하지 않아도 괜찮습니다. 필요하면 “모름”을 남겨도 됩니다.',
      };
    }

    const overheatFocusPct = 80;
    const tooLooseRestPct = 70;

    if (stats.focusPct >= overheatFocusPct) {
      return {
        tone: 'overheat' as const,
        title: '과열 구간입니다.',
        body: '완료 흐름이 아주 좋습니다. 과열되기 전에 휴식을 한 번 넣어 주시면 더 오래 갑니다.',
      };
    }

    if (stats.restPct >= tooLooseRestPct) {
      return {
        tone: 'loose' as const,
        title: '흐름이 조금 느슨해졌습니다.',
        body: '휴식도 유지의 일부입니다. 오늘은 5분만 “시작”으로 연결해 보세요.',
      };
    }

    return {
      tone: 'ok' as const,
      title: '균형이 좋습니다.',
      body: '완료와 휴식이 같이 쌓이고 있습니다. 지금 흐름 그대로만 가도 충분합니다.',
    };
  }, [stats.done, stats.rest, stats.focusPct, stats.restPct]);

  const guideAccent = useMemo(() => {
    if (guidance.tone === 'overheat') return 'rgba(76,201,255,0.22)';
    if (guidance.tone === 'loose') return 'rgba(59,231,176,0.18)';
    return 'rgba(255,255,255,0.10)';
  }, [guidance.tone]);

  const guideBorder = useMemo(() => {
    if (guidance.tone === 'overheat') return 'rgba(76,201,255,0.35)';
    if (guidance.tone === 'loose') return 'rgba(59,231,176,0.28)';
    return 'rgba(31,42,56,1)';
  }, [guidance.tone]);

  // ✅ 상태바 가림 해결(안드로이드 대비)
  const androidTopPad = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: BG, paddingTop: androidTopPad }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 24 }}>
          {/* ✅ 헤더 + 스위치형 UX */}
          <View style={{ marginBottom: 12 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <Pressable
                onPress={() => navigation.goBack()}
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

              <Text style={{ color: TEXT, fontSize: 16, fontWeight: '900', flex: 1 }} numberOfLines={1}>
                {title}
              </Text>
            </View>

            {/* 스위치 카드 */}
            <View
              style={{
                marginTop: 10,
                backgroundColor: CARD,
                borderWidth: 1,
                borderColor: confirmLock ? 'rgba(76,201,255,0.35)' : LINE,
                borderRadius: 16,
                padding: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ color: TEXT, fontWeight: '900' }}>확인 잠금</Text>
                <Text style={{ color: MUTED, fontSize: 12, marginTop: 4, lineHeight: 18 }}>
                  {confirmLock ? '최근 3일만 확인 가능' : '과거 확인 제한 없음'}
                </Text>
              </View>

              <Switch
                value={confirmLock}
                onValueChange={(v) => applyConfirmLock(v)}
                trackColor={{ false: '#273445', true: 'rgba(76,201,255,0.35)' }}
                thumbColor={confirmLock ? FOCUS : '#8FA3B8'}
                ios_backgroundColor="#273445"
              />
            </View>
          </View>

          {/* 상단 2카드 */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
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
              <Text style={{ color: MUTED, fontSize: 12 }}>최근 {days}일 · 밸런스</Text>

              <Text style={{ color: TEXT, fontSize: 14, fontWeight: '900', marginTop: 8 }}>
                {guidance.title}
              </Text>

              <Text style={{ color: MUTED, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
                {guidance.body}
              </Text>

              <View
                style={{
                  marginTop: 12,
                  height: 10,
                  borderRadius: 999,
                  backgroundColor: BG,
                  borderWidth: 1,
                  borderColor: LINE,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${stats.focusPct}%`,
                    height: '100%',
                    backgroundColor: rgbaFromRgb(ratioColor, 0.85),
                  }}
                />
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                <Text style={{ color: FOCUS, fontWeight: '900' }}>완료 {stats.done}</Text>
                <Text style={{ color: REST, fontWeight: '900' }}>휴식 {stats.rest}</Text>
              </View>

              <Text style={{ color: MUTED, fontSize: 11, marginTop: 6 }}>
                모름 {stats.unknown} · 전체 {stats.total}
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                backgroundColor: CARD,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: guideBorder,
                padding: 14,
                overflow: 'hidden',
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

              <Text style={{ color: MUTED, fontSize: 12 }}>요약</Text>

              <Text style={{ color: TEXT, fontSize: 16, fontWeight: '900', marginTop: 6 }}>
                기록 {stats.total}
              </Text>

              <Text style={{ color: MUTED, fontSize: 12, marginTop: 8, lineHeight: 18 }}>
                {confirmLock ? '확인 잠금이 켜져 있어 최근 3일만 확인할 수 있습니다.' : '완료/휴식/모름은 모두 “관찰”로 기록됩니다.'}
              </Text>

              <View
                style={{
                  marginTop: 10,
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: LINE,
                  backgroundColor: '#0F1620',
                }}
              >
                <Text style={{ color: TEXT, fontSize: 12, fontWeight: '900' }}>
                  {confirmLock ? '권장: 지금은 과거 확인을 멈춥니다.' : '권장: 확정이 필요 없으면 “모름”으로 둬도 됩니다.'}
                </Text>
                <Text style={{ color: MUTED, fontSize: 11, marginTop: 4, lineHeight: 16 }}>
                  {confirmLock ? '확인은 불안을 잠깐만 낮추고, 다음 불안을 키울 수 있습니다.' : '정답을 찾지 않는 연습이 강박을 약하게 만듭니다.'}
                </Text>
              </View>
            </View>
          </View>

          {/* 큰 잔디 */}
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
                      const bg =
                        cell.status === 'done'
                          ? FOCUS
                          : cell.status === 'rest'
                            ? REST
                            : cell.status === 'unknown'
                              ? UNKNOWN
                              : '#1A2330';

                      // ✅ 블록 탭 반응 없음 + confirmLock 시 인터랙션 차단(확인 행동 줄이기)
                      const disabled = confirmLock;

                      return (
                        <Pressable key={`${w}-${r}`} disabled={disabled} onPress={() => {}}>
                          <View
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 3,
                              backgroundColor: bg,
                              borderWidth: 1,
                              borderColor: LINE,
                              opacity: disabled ? 0.92 : 1,
                            }}
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: 10,
                marginTop: 12,
                alignItems: 'center',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: REST, borderWidth: 1, borderColor: LINE }} />
                <Text style={{ color: MUTED, fontSize: 12, fontWeight: '900' }}>휴식</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: UNKNOWN, borderWidth: 1, borderColor: LINE }} />
                <Text style={{ color: MUTED, fontSize: 12, fontWeight: '900' }}>모름</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: '#1A2330', borderWidth: 1, borderColor: LINE }} />
                <Text style={{ color: MUTED, fontSize: 12, fontWeight: '900' }}>미체크</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: FOCUS, borderWidth: 1, borderColor: LINE }} />
                <Text style={{ color: MUTED, fontSize: 12, fontWeight: '900' }}>완료</Text>
              </View>
            </View>

            {confirmLock ? (
              <View style={{ marginTop: 12, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: LINE, backgroundColor: '#0F1620' }}>
                <Text style={{ color: MUTED, fontSize: 12, lineHeight: 18 }}>
                  확인 잠금이 켜져 있습니다. 과거를 확인하고 싶어질수록, 지금은 그 행동을 줄이는 연습이 됩니다.
                </Text>
              </View>
            ) : null}
          </View>

          {/* 월 캘린더 */}
          <View style={{ backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: LINE, padding: 10, marginBottom: 12 }}>
            <Calendar
              markedDates={markedDates}
              markingType="simple"
              // ✅ 눌러도 날짜 표시 카드 없음
              // ✅ confirmLock ON이면 최근 3일 외 날짜 확인 차단
              onDayPress={(day) => {
                if (!confirmLock) return;
                const k = day.dateString;
                if (k < lockRange.min || k > lockRange.max) return;
              }}
              minDate={confirmLock ? lockRange.min : undefined}
              maxDate={confirmLock ? lockRange.max : undefined}
              hideArrows={confirmLock}
              disableAllTouchEventsForDisabledDays={confirmLock}
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

          {/* ✅ 응원 섹션 삭제 완료 */}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
