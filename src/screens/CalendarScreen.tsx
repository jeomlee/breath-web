// src/screens/CalendarScreen.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text as RNText,
  Pressable,
  Alert,
  ScrollView,
  type TextProps,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import dayjs from 'dayjs';
import { supabase } from '../api/supabaseClient';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GroupKey } from '../navigation/types';
import ScreenContainer from '../components/ScreenContainer';

function T(props: TextProps) {
  return <RNText {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}

type RoutineRow = {
  id: string;
  title: string;
  is_active: boolean;
};

type DailyLogRow = {
  date_key: string;
  routine_id: string | null;
  status: 'done' | 'rest';
};

const BG = '#0B0F14';
const CARD = '#121A23';
const LINE = '#1E2A38';
const MUTED = '#8FA3B8';
const TEXT = '#EAF2FF';

const FOCUS = '#4CC9FF';
const REST = '#3BE7B0';
const NONE = '#1A2330';

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

export default function CalendarScreen(
  { presetFilter: presetFromProp }: { presetFilter?: GroupKey } = {}
) {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const presetFromRoute = route?.params?.presetFilter as GroupKey | undefined;
  const presetFilter = presetFromProp ?? presetFromRoute;
  void presetFilter;

  const [currentMonth, setCurrentMonth] = useState(dayjs().format('YYYY-MM'));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // ✅ 토글 의미 변경: "미체크 숨기기"
  const [hideNone, setHideNone] = useState(false);

  const [routineMap, setRoutineMap] = useState<Record<string, { title: string; is_active: boolean }>>({});
  const [logs, setLogs] = useState<DailyLogRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [tip, setTip] = useState('');
  const tipTimer = useRef<any>(null);

  const monthRange = useMemo(() => {
    const start = dayjs(currentMonth + '-01').startOf('month').format('YYYY-MM-DD');
    const end = dayjs(currentMonth + '-01').endOf('month').format('YYYY-MM-DD');
    return { start, end };
  }, [currentMonth]);

  const showTip = useCallback((text: string) => {
    setTip(text);
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTip(''), 1200);
  }, []);

  const loadRoutines = useCallback(async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const { data, error } = await supabase
      .from('routines')
      .select('id,title,is_active')
      .eq('user_id', user.id);

    if (error) {
      Alert.alert('기록 불러오기 실패', error.message);
      return;
    }

    const map: Record<string, { title: string; is_active: boolean }> = {};
    (data as RoutineRow[] | null)?.forEach((r) => {
      map[r.id] = { title: r.title, is_active: r.is_active };
    });

    setRoutineMap(map);
  }, []);

  const loadLogsForMonth = useCallback(async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('daily_logs')
      .select('date_key,routine_id,status')
      .eq('user_id', user.id)
      .gte('date_key', monthRange.start)
      .lte('date_key', monthRange.end);

    setLoading(false);

    if (error) {
      Alert.alert('기록 불러오기 실패', error.message);
      return;
    }
    setLogs((data as any) || []);
  }, [monthRange.end, monthRange.start]);

  useEffect(() => {
    loadRoutines();
  }, [loadRoutines]);

  useEffect(() => {
    loadLogsForMonth();
  }, [loadLogsForMonth]);

  useEffect(() => {
    return () => {
      if (tipTimer.current) clearTimeout(tipTimer.current);
    };
  }, []);

  /**
   * ✅ 달력용 상태 집계: 휴식 / 미체크 / 완료
   * - 이제 "활성/비활성 필터"는 제거
   */
  const dayStatus = useMemo(() => {
    const byDay: Record<string, { done: number; rest: boolean }> = {};

    const ensure = (d: string) => {
      if (!byDay[d]) byDay[d] = { done: 0, rest: false };
      return byDay[d];
    };

    for (const row of logs) {
      const d = row.date_key;
      const s = ensure(d);

      // 하루 쉬기(기록 없음)
      if (row.status === 'rest' && (row.routine_id === null || row.routine_id === undefined)) {
        s.rest = true;
        continue;
      }

      // 완료 카운트
      if (row.status === 'done' && row.routine_id) {
        s.done += 1;
        continue;
      }

      if (row.status === 'rest') s.rest = true;
    }

    const out: Record<string, { status: 'done' | 'rest' | 'none'; doneCount: number }> = {};
    for (const [d, v] of Object.entries(byDay)) {
      const status = v.done > 0 ? 'done' : v.rest ? 'rest' : 'none';
      out[d] = { status, doneCount: v.done };
    }
    return out;
  }, [logs]);

  const dayCellBg = useCallback(
    (dateKey: string) => {
      const st = dayStatus[dateKey];
      if (!st) return 'transparent';

      if (st.status === 'rest') return rgba(REST, 0.22);

      if (st.status === 'done') {
        const c = st.doneCount;
        const lv = c <= 1 ? 1 : c === 2 ? 2 : c === 3 ? 3 : 4;
        const alpha = [0, 0.18, 0.28, 0.4, 0.55][lv];
        const base = mixHex(REST, FOCUS, 0.78);
        return rgbaFromRgbString(base, alpha);
      }

      return 'transparent';
    },
    [dayStatus]
  );

  const onDayPress = useCallback(
    (d: string) => {
      setSelectedDate(d);
      const st = dayStatus[d]?.status ?? 'none';
      if (st === 'done') showTip('완료');
      else if (st === 'rest') showTip('휴식');
      else showTip('미체크');
    },
    [dayStatus, showTip]
  );

  const selectedItems = useMemo(() => {
    if (!selectedDate) {
      return { restDay: false, items: [] as Array<{ id: string; title: string; status: 'done' | 'rest' }> };
    }

    let restDay = false;
    const items: Array<{ id: string; title: string; status: 'done' | 'rest' }> = [];

    for (const row of logs) {
      if (row.date_key !== selectedDate) continue;

      // 하루 쉬기
      if (row.status === 'rest' && (row.routine_id === null || row.routine_id === undefined)) {
        restDay = true;
        continue;
      }

      if (row.routine_id) {
        if (row.status !== 'done' && row.status !== 'rest') continue;

        const meta = routineMap[row.routine_id];
        items.push({
          id: row.routine_id,
          title: meta?.title ?? '삭제된 기록',
          status: row.status,
        });
      }
    }

    // 중복 제거(done 우선)
    const uniq = new Map<string, { id: string; title: string; status: 'done' | 'rest' }>();
    for (const it of items) {
      const prev = uniq.get(it.id);
      if (!prev) uniq.set(it.id, it);
      else if (prev.status === 'rest' && it.status === 'done') uniq.set(it.id, it);
    }

    const out = Array.from(uniq.values()).sort((a, b) => {
      if (a.status !== b.status) return a.status === 'done' ? -1 : 1;
      return a.title.localeCompare(b.title, 'ko');
    });

    return { restDay, items: out };
  }, [selectedDate, logs, routineMap]);

  const selectedPretty = useMemo(() => {
    if (!selectedDate) return null;
    const d = dayjs(selectedDate);
    const pretty = `${d.month() + 1}/${d.date()}`;
    const st = dayStatus[selectedDate];
    if (!st) return `${pretty} · 미체크`;
    if (st.status === 'done') return `${pretty} · 완료 ${st.doneCount}개`;
    if (st.status === 'rest') return `${pretty} · 휴식`;
    return `${pretty} · 미체크`;
  }, [selectedDate, dayStatus]);

  const goBackToInsights = useCallback(() => {
    if (nav.canGoBack?.()) {
      nav.goBack();
      return;
    }
    nav.navigate('Insights');
  }, [nav]);

  // ✅ 위 여백: 가능한 타이트하게
  const topPad = useMemo(() => Math.max(insets.top - 14, 0), [insets.top]);

  return (
    <ScreenContainer bg={BG} barStyle="light-content">
      <ScrollView
        contentContainerStyle={{
          paddingTop: topPad,
          paddingHorizontal: 12,
          paddingBottom: 18,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* 헤더 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            onPress={goBackToInsights}
            hitSlop={10}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingVertical: 2,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: '#0F151D',
              borderWidth: 1,
              borderColor: LINE,
            }}
          >
            <T style={{ color: MUTED, fontWeight: '900', fontSize: 14 }}>←</T>
            <T style={{ color: MUTED, fontWeight: '900', fontSize: 13 }}>인사이트</T>
          </Pressable>

          <View style={{ alignItems: 'flex-end' }}>
            <T style={{ color: TEXT, fontSize: 22, fontWeight: '900' }}>캘린더</T>

          </View>
        </View>

        {/* 캘린더 카드 */}
        <View
          style={{
            backgroundColor: CARD,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: LINE,
            padding: 10,
            marginTop: 6,
          }}
        >
          <Calendar
            markingType={'custom'}
            markedDates={{}}
            onDayPress={(day) => onDayPress(day.dateString)}
            onMonthChange={(m) => {
              const mm = dayjs(m.dateString).format('YYYY-MM');
              setCurrentMonth(mm);
              setSelectedDate(null);
            }}
            theme={{
              calendarBackground: CARD,
              monthTextColor: TEXT,
              textMonthFontWeight: '900',
              dayTextColor: MUTED,
              textDisabledColor: '#2A3544',
              todayTextColor: FOCUS,
              arrowColor: FOCUS,
              textDayFontWeight: '800',
              textDayHeaderFontWeight: '900',
            }}
            dayComponent={({ date, state }) => {
              const d = date?.dateString;
              const isDisabled = state === 'disabled';
              const isToday = d === dayjs().format('YYYY-MM-DD');

              const st = d ? dayStatus[d]?.status ?? 'none' : 'none';
              const bg = d ? dayCellBg(d) : 'transparent';
              const isSelected = !!d && selectedDate === d;

              const isNone = st === 'none';
              const disableNone = hideNone && isNone; // ✅ 미체크 숨기기 ON이면 미체크 날짜 클릭 막기

              const txtColor = isToday
                ? FOCUS
                : isNone && hideNone
                  ? 'rgba(143,163,184,0.28)' // ✅ 미체크 숨김(흐리게)
                  : bg === 'transparent'
                    ? MUTED
                    : TEXT;

              return (
                <Pressable
                  onPress={() => d && onDayPress(d)}
                  disabled={isDisabled || disableNone}
                  style={{
                    width: 40,
                    height: 42,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isDisabled ? 0.35 : disableNone ? 0.5 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      backgroundColor: bg,
                      borderWidth: isSelected ? 2 : 1,
                      borderColor: isSelected ? TEXT : 'rgba(30,42,56,0.9)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <T style={{ color: txtColor, fontWeight: '900' }}>{date?.day}</T>
                  </View>

                  {st === 'rest' && (
                    <View style={{ width: 14, height: 3, borderRadius: 999, backgroundColor: REST, marginTop: 4, opacity: 0.9 }} />
                  )}
                  {st === 'done' && (
                    <View style={{ width: 14, height: 3, borderRadius: 999, backgroundColor: FOCUS, marginTop: 4, opacity: 0.85 }} />
                  )}
                </Pressable>
              );
            }}
          />
        </View>

        {/* 캘린더 아래: 레전드 + "미체크 숨기기" 토글(기존 스위치 UI 유지) */}
        <View
          style={{
            marginTop: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  backgroundColor: rgba(REST, 0.9),
                  borderWidth: 1,
                  borderColor: LINE,
                }}
              />
              <T style={{ color: MUTED, fontSize: 12, fontWeight: '900' }}>휴식</T>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: NONE, borderWidth: 1, borderColor: LINE }} />
              <T style={{ color: MUTED, fontSize: 12, fontWeight: '900' }}>미체크</T>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  backgroundColor: rgba(FOCUS, 0.9),
                  borderWidth: 1,
                  borderColor: LINE,
                }}
              />
              <T style={{ color: MUTED, fontSize: 12, fontWeight: '900' }}>완료</T>
            </View>
          </View>

          <Pressable
            onPress={() => {
              setHideNone((v) => !v);
              setSelectedDate(null);
            }}
            hitSlop={8}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: '#0F151D',
              borderWidth: 1,
              borderColor: LINE,
            }}
          >
            <T style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>미체크 숨김</T>

            <View
              style={{
                width: 44,
                height: 26,
                borderRadius: 999,
                backgroundColor: hideNone ? rgba(FOCUS, 0.22) : 'rgba(143,163,184,0.14)',
                borderWidth: 1,
                borderColor: hideNone ? 'rgba(76,201,255,0.45)' : 'rgba(143,163,184,0.28)',
                padding: 3,
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  backgroundColor: hideNone ? FOCUS : '#9BB0C8',
                  transform: [{ translateX: hideNone ? 18 : 0 }],
                }}
              />
            </View>
          </Pressable>
        </View>

        {(selectedPretty || tip) && (
          <View
            style={{
              marginTop: 10,
              marginBottom: 10,
              backgroundColor: 'rgba(76,201,255,0.10)',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: 'rgba(76,201,255,0.25)',
              paddingVertical: 10,
              paddingHorizontal: 12,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <T style={{ color: FOCUS, fontWeight: '900' }}>{selectedPretty ?? tip}</T>
            <Pressable
              onPress={() => {
                setSelectedDate(null);
                setTip('');
              }}
              hitSlop={10}
            >
              <T style={{ color: MUTED, fontWeight: '900' }}>닫기</T>
            </Pressable>
          </View>
        )}

        <View style={{ marginTop: 12 }}>
          <T style={{ color: TEXT, fontSize: 14, fontWeight: '450', marginBottom: 8 }}>
            {selectedDate ? `${dayjs(selectedDate).format('M/D')} 기록` : '날짜를 선택해 주세요'}
          </T>

          {!selectedDate ? null : (
            <>
              {selectedItems.restDay && (
                <View
                  style={{
                    backgroundColor: CARD,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: LINE,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <T style={{ color: TEXT, fontWeight: '900' }}>오늘은 쉬기</T>
                    <View
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: 999,
                        backgroundColor: rgba(REST, 0.16),
                        borderWidth: 1,
                        borderColor: rgba(REST, 0.35),
                      }}
                    >
                      <T style={{ color: REST, fontWeight: '900', fontSize: 12 }}>휴식</T>
                    </View>
                  </View>
                  <T style={{ color: MUTED, fontSize: 12, marginTop: 6 }}>
                    기록 없이 ‘쉬기’만 기록된 날짜입니다.
                  </T>
                </View>
              )}

              {selectedItems.items.length === 0 && !selectedItems.restDay ? (
                <View
                  style={{
                    backgroundColor: '#0F151D',
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: LINE,
                    padding: 12,
                  }}
                >
                  <T style={{ color: MUTED, fontSize: 12 }}>
                    이 날짜에는 완료/휴식 체크 기록이 없습니다. (미체크)
                  </T>
                </View>
              ) : (
                selectedItems.items.map((it) => {
                  const isFocus = it.status === 'done';
                  const c = isFocus ? FOCUS : REST;
                  const bg = isFocus ? rgba(FOCUS, 0.08) : rgba(REST, 0.08);
                  const bd = isFocus ? rgba(FOCUS, 0.22) : rgba(REST, 0.22);

                  return (
                    <View
                      key={`${selectedDate}-${it.id}-${it.status}`}
                      style={{
                        backgroundColor: CARD,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: LINE,
                        padding: 12,
                        marginBottom: 10,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <T style={{ color: TEXT, fontWeight: '900' }} numberOfLines={1}>
                          {it.title}
                        </T>

                        <View
                          style={{
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            borderRadius: 999,
                            backgroundColor: bg,
                            borderWidth: 1,
                            borderColor: bd,
                          }}
                        >
                          <T style={{ color: c, fontWeight: '900', fontSize: 12 }}>
                            {isFocus ? '완료' : '휴식'}
                          </T>
                        </View>
                      </View>

                      <T style={{ color: MUTED, fontSize: 12, marginTop: 6 }}>
                        {isFocus ? '완료로 기록되었습니다.' : '휴식으로 기록되었습니다.'}
                      </T>
                    </View>
                  );
                })
              )}
            </>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
