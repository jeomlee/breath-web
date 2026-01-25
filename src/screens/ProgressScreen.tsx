import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { Calendar } from 'react-native-calendars';
import dayjs from 'dayjs';
import { supabase } from '../api/supabaseClient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ProgressStackParamList } from '../AppNavigator';

type Routine = {
  id: string;
  title: string;
  sort_order: number;
  is_active: boolean;
  group_key: string | null;
};

type DailyLogRow = {
  date_key: string; // YYYY-MM-DD
  routine_id: string | null;
  status: 'done' | 'rest';
};

const GROUPS = [
  { key: 'breath', name: 'Breath', color: '#4CC9FF' },
  { key: 'mind', name: 'Mind', color: '#3BE7D1' },
  { key: 'body', name: 'Body', color: '#8B7CFF' },
  { key: 'work', name: 'Work', color: '#2EA0FF' },
] as const;

type GroupKey = typeof GROUPS[number]['key'];
type FilterKey = 'all' | GroupKey;

const REST_COLOR = '#55667A';

function rgba(hex: string, a: number) {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function mondayStartKey(dateKey: string) {
  const d = dayjs(dateKey).startOf('day');
  const diff = (d.day() + 6) % 7;
  return d.subtract(diff, 'day').format('YYYY-MM-DD');
}

export default function ProgressScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ProgressStackParamList>>();
  const route = useRoute<any>();

  const presetFilter = route?.params?.presetFilter as GroupKey | undefined;

  const [filter, setFilter] = useState<FilterKey>('all');

  const [currentMonth, setCurrentMonth] = useState(dayjs().format('YYYY-MM'));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [logsMonth, setLogsMonth] = useState<DailyLogRow[]>([]);
  const [logs8w, setLogs8w] = useState<DailyLogRow[]>([]);

  const [expanded, setExpanded] = useState(false); // 기록별 잔디 펼치기
  const [tip, setTip] = useState('');
  const tipTimer = useRef<any>(null);

  // presetFilter 들어오면 반영
  useEffect(() => {
    if (!presetFilter) return;
    setFilter(presetFilter);
  }, [presetFilter]);

  // Month range
  const monthRange = useMemo(() => {
    const start = dayjs(currentMonth + '-01').startOf('month').format('YYYY-MM-DD');
    const end = dayjs(currentMonth + '-01').endOf('month').format('YYYY-MM-DD');
    return { start, end };
  }, [currentMonth]);

  // 8 weeks range
  const weeks = 8;
  const days = weeks * 7;
  const start8w = dayjs().startOf('day').subtract(days - 1, 'day').format('YYYY-MM-DD');
  const end8w = dayjs().startOf('day').format('YYYY-MM-DD');
  const weekStart = useMemo(() => mondayStartKey(end8w), [end8w]);

  const showTip = (text: string) => {
    setTip(text);
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTip(''), 1300);
  };

  const loadRoutines = async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const { data, error } = await supabase
      .from('routines')
      .select('id,title,sort_order,is_active,group_key')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) return Alert.alert('기록 로드 실패', error.message);
    setRoutines((data as any) || []);
  };

  const loadMonthLogs = async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const { data, error } = await supabase
      .from('daily_logs')
      .select('date_key,routine_id,status')
      .eq('user_id', user.id)
      .gte('date_key', monthRange.start)
      .lte('date_key', monthRange.end);

    if (error) return Alert.alert('기록 로드 실패', error.message);
    setLogsMonth((data as any) || []);
  };

  const load8wLogs = async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const { data, error } = await supabase
      .from('daily_logs')
      .select('date_key,routine_id,status')
      .eq('user_id', user.id)
      .gte('date_key', start8w)
      .lte('date_key', end8w);

    if (error) return Alert.alert('기록 로드 실패', error.message);
    setLogs8w((data as any) || []);
  };

  useEffect(() => {
    loadRoutines();
    load8wLogs();
    return () => {
      if (tipTimer.current) clearTimeout(tipTimer.current);
    };
  }, []);

  useEffect(() => {
    loadMonthLogs();
  }, [monthRange.start, monthRange.end]);

  // routineId -> groupKey
  const routineGroupMap = useMemo(() => {
    const map: Record<string, GroupKey> = {};
    for (const r of routines) {
      map[r.id] = (r.group_key ?? 'breath') as GroupKey;
    }
    return map;
  }, [routines]);

  // Month day stats
  const dayStatsMonth = useMemo(() => {
    const byDay: Record<
      string,
      {
        doneTotal: number;
        rest: boolean;
        groupDone: Record<GroupKey, number>;
      }
    > = {};

    const ensure = (d: string) => {
      if (!byDay[d]) {
        byDay[d] = {
          doneTotal: 0,
          rest: false,
          groupDone: { breath: 0, mind: 0, body: 0, work: 0 },
        };
      }
      return byDay[d];
    };

    for (const row of logsMonth) {
      const d = row.date_key;
      const s = ensure(d);

      if (row.status === 'rest' && (row.routine_id === null || row.routine_id === undefined)) {
        s.rest = true;
        continue;
      }

      if (row.status === 'done' && row.routine_id) {
        const g = routineGroupMap[row.routine_id] ?? 'breath';
        s.doneTotal += 1;
        s.groupDone[g] += 1;
      }
    }

    return byDay;
  }, [logsMonth, routineGroupMap]);

  // Tooltip text (calendar)
  const tooltipText = useMemo(() => {
    if (!selectedDate) return null;
    const st = dayStatsMonth[selectedDate];

    const d = dayjs(selectedDate);
    const pretty = `${d.month() + 1}/${d.date()}`;

    if (!st) return `${pretty} 기록 없음`;
    if (st.rest) return `${pretty} 쉬기`;

    if (filter === 'all') {
      if (st.doneTotal <= 0) return `${pretty} 기록 없음`;
      return `${pretty} 완료 ${st.doneTotal}개`;
    }

    const cnt = st.groupDone[filter as GroupKey] ?? 0;
    if (cnt <= 0) return `${pretty} 기록 없음`;
    return `${pretty} 완료 ${cnt}`;
  }, [selectedDate, dayStatsMonth, filter]);

  const intensity = (count: number) => {
    if (count <= 0) return 0;
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count === 3) return 3;
    return 4;
  };

  // ====== 8W data (Insights merged) ======

  // routines by group
  const byGroup = useMemo(() => {
    const map = new Map<GroupKey, Routine[]>();
    for (const g of GROUPS) map.set(g.key, []);
    for (const r of routines) {
      const key = (r.group_key ?? 'breath') as GroupKey;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [routines]);

  // doneMap (8w): routineId -> set(dateKey)
  const doneMap8w = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const row of logs8w) {
      if (row.status !== 'done') continue;
      if (!row.routine_id) continue;
      if (!map.has(row.routine_id)) map.set(row.routine_id, new Set());
      map.get(row.routine_id)!.add(row.date_key);
    }
    return map;
  }, [logs8w]);

  const dayList8w = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < days; i++) arr.push(dayjs(start8w).add(i, 'day').format('YYYY-MM-DD'));
    return arr;
  }, [start8w, days]);

  const makeRoutineGrid8w = (routineId: string) => {
    const set = doneMap8w.get(routineId) ?? new Set<string>();
    const cols: { date: string; done: boolean }[][] = [];
    for (let w = 0; w < weeks; w++) {
      const col: { date: string; done: boolean }[] = [];
      for (let r = 0; r < 7; r++) {
        const idx = w * 7 + r;
        const date = dayList8w[idx];
        col.push({ date, done: set.has(date) });
      }
      cols.push(col);
    }
    return cols;
  };

  const percent8w = (routineId: string) => {
    const set = doneMap8w.get(routineId) ?? new Set<string>();
    return Math.round((set.size / days) * 100);
  };

  // group summary counts (8w): group -> day -> doneCount
  const groupDayCount8w = useMemo(() => {
    const map: Record<GroupKey, Record<string, number>> = { breath: {}, mind: {}, body: {}, work: {} };

    for (const row of logs8w) {
      if (row.status !== 'done') continue;
      if (!row.routine_id) continue;
      const g = routineGroupMap[row.routine_id] ?? 'breath';
      map[g][row.date_key] = (map[g][row.date_key] ?? 0) + 1;
    }

    return map;
  }, [logs8w, routineGroupMap]);

  const makeGroupGrid8w = (gkey: GroupKey) => {
    const cols: { date: string; count: number }[][] = [];
    for (let w = 0; w < weeks; w++) {
      const col: { date: string; count: number }[] = [];
      for (let r = 0; r < 7; r++) {
        const idx = w * 7 + r;
        const date = dayList8w[idx];
        col.push({ date, count: groupDayCount8w[gkey][date] ?? 0 });
      }
      cols.push(col);
    }
    return cols;
  };

  const pressGroupSummary = (g: GroupKey) => {
    setFilter(g);
    setSelectedDate(null);
    showTip(`${GROUPS.find(x => x.key === g)?.name ?? g} 필터`);
  };

  const renderChip = (key: FilterKey, label: string, color?: string) => {
    const active = filter === key;
    return (
      <Pressable
        key={key}
        onPress={() => {
          setFilter(key);
          setSelectedDate(null);
        }}
        style={{
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 999,
          backgroundColor: active ? 'rgba(76,201,255,0.12)' : '#0F151D',
          borderWidth: 1,
          borderColor: active ? (color ?? '#4CC9FF') : '#1E2A38',
          marginRight: 8,
          marginBottom: 8,
        }}
      >
        <Text style={{ color: active ? (color ?? '#4CC9FF') : '#8FA3B8', fontWeight: '900' }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0B0F14' }}>
      <ScrollView contentContainerStyle={{ paddingTop: 64, paddingHorizontal: 16, paddingBottom: 28 }}>
        <Text style={{ color: '#EAF2FF', fontSize: 24, fontWeight: '900' }}>Progress</Text>
        <Text style={{ color: '#8FA3B8', marginTop: 8, lineHeight: 20 }}>
          한 화면으로 끝내자. 캘린더 + 목표 태그 + 기록 잔디.
        </Text>

        {/* Filter chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 }}>
          {renderChip('all', '전체', '#4CC9FF')}
          {GROUPS.map((g) => renderChip(g.key, g.name, g.color))}
        </View>

        {/* small tip bar */}
        <View
          style={{
            marginTop: 6,
            marginBottom: 10,
            backgroundColor: 'rgba(76,201,255,0.10)',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: 'rgba(76,201,255,0.25)',
            paddingVertical: 10,
            paddingHorizontal: 12,
          }}
        >
          <Text style={{ color: tip ? '#4CC9FF' : '#8FA3B8', fontWeight: '900' }}>
            {tip || '날짜 터치 → 툴팁 / 아래는 요약(접기/펴기)'}
          </Text>
        </View>

        {/* Calendar card */}
        {tooltipText && (
          <View
            style={{
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
            <Text style={{ color: '#4CC9FF', fontWeight: '900' }}>{tooltipText}</Text>
            <Pressable onPress={() => setSelectedDate(null)}>
              <Text style={{ color: '#8FA3B8', fontWeight: '900' }}>닫기</Text>
            </Pressable>
          </View>
        )}

        <View
          style={{
            backgroundColor: '#121A23',
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#1E2A38',
            padding: 10,
          }}
        >
          <Calendar
            markingType={'custom'}
            markedDates={{}}
            onDayPress={(day) => setSelectedDate(day.dateString)}
            onMonthChange={(m) => {
              const mm = dayjs(m.dateString).format('YYYY-MM');
              setCurrentMonth(mm);
              setSelectedDate(null);
            }}
            theme={{
              calendarBackground: '#121A23',
              monthTextColor: '#EAF2FF',
              textMonthFontWeight: '900',
              dayTextColor: '#8FA3B8',
              textDisabledColor: '#2A3544',
              todayTextColor: '#4CC9FF',
              arrowColor: '#4CC9FF',
              textDayFontWeight: '800',
              textDayHeaderFontWeight: '900',
            }}
            dayComponent={({ date, state }) => {
              const d = date?.dateString;
              const isDisabled = state === 'disabled';
              const isToday = d === dayjs().format('YYYY-MM-DD');
              const st = d ? dayStatsMonth[d] : undefined;

              const baseColor =
                filter === 'all'
                  ? '#4CC9FF'
                  : GROUPS.find((g) => g.key === filter)?.color ?? '#4CC9FF';

              const isRest = !!st?.rest;

              const count = !st
                ? 0
                : isRest
                  ? 0
                  : filter === 'all'
                    ? st.doneTotal
                    : st.groupDone[filter as GroupKey];

              const lv = intensity(count);

              const bg = isRest
                ? rgba('#4CC9FF', 0.18)
                : lv === 0
                  ? 'transparent'
                  : rgba(baseColor, [0, 0.18, 0.28, 0.40, 0.55][lv]);

              const selected = selectedDate === d;

              const dots = !st
                ? []
                : isRest
                  ? [{ color: REST_COLOR }]
                  : filter === 'all'
                    ? GROUPS.filter((g) => (st.groupDone[g.key] ?? 0) > 0).map((g) => ({ color: g.color }))
                    : count > 0
                      ? [{ color: baseColor }]
                      : [];

              return (
                <Pressable
                  onPress={() => d && setSelectedDate(d)}
                  disabled={isDisabled}
                  style={{
                    width: 40,
                    height: 42,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isDisabled ? 0.35 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      backgroundColor: bg,
                      borderWidth: selected ? 2 : 1,
                      borderColor: selected ? '#EAF2FF' : 'rgba(30,42,56,0.9)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: isToday ? '#4CC9FF' : (bg === 'transparent' ? '#8FA3B8' : '#EAF2FF'),
                        fontWeight: '900',
                      }}
                    >
                      {date?.day}
                    </Text>
                  </View>

                  {dots.length > 0 && (
                    <View style={{ flexDirection: 'row', marginTop: 3, gap: 3 }}>
                      {dots.slice(0, 4).map((x, idx) => (
                        <View
                          key={idx}
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: 3,
                            backgroundColor: x.color,
                          }}
                        />
                      ))}
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        </View>

        {/* ===== 8W Summary (collapsed by default) ===== */}
        <View style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ color: '#EAF2FF', fontSize: 16, fontWeight: '900' }}>8주 요약</Text>
            <Text style={{ color: '#8FA3B8', fontSize: 12 }}>{weekStart} ~ {end8w}</Text>
          </View>

          {/* Goal tags summary cards */}
          <View style={{ marginTop: 10 }}>
            {GROUPS.map((g) => {
              const grid = makeGroupGrid8w(g.key);
              const total = Object.values(groupDayCount8w[g.key]).reduce((a, b) => a + b, 0);

              return (
                <Pressable
                  key={g.key}
                  onPress={() => pressGroupSummary(g.key)}
                  style={{
                    backgroundColor: '#121A23',
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: '#1E2A38',
                    padding: 14,
                    marginBottom: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: g.color }} />
                      <Text style={{ color: '#EAF2FF', fontSize: 15, fontWeight: '900' }}>{g.name}</Text>
                    </View>
                    <Text style={{ color: '#8FA3B8', fontSize: 12 }}>{total} done</Text>
                  </View>

                  <View style={{ flexDirection: 'row', marginTop: 12, gap: 6 }}>
                    {grid.map((col, w) => (
                      <View key={w} style={{ gap: 6 }}>
                        {col.map((cell, rr) => {
                          const lv = intensity(cell.count);
                          const bg = lv === 0 ? '#1A2330' : rgba(g.color, [0, 0.20, 0.32, 0.46, 0.62][lv]);
                          return (
                            <Pressable
                              key={`${w}-${rr}`}
                              onPress={() => {
                                const label = dayjs(cell.date).format('M/D');
                                showTip(cell.count > 0 ? `${label} 완료 ${cell.count}` : `${label} 기록 없음`);
                              }}
                            >
                              <View
                                style={{
                                  width: 11,
                                  height: 11,
                                  borderRadius: 3,
                                  backgroundColor: bg,
                                  borderWidth: 1,
                                  borderColor: '#1E2A38',
                                }}
                              />
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </View>

                  <Text style={{ color: '#8FA3B8', fontSize: 12, marginTop: 12 }}>
                    {g.key === 'breath' ? '시원하게, 무리 없이.' : '많이가 아니라, 계속.'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Expand / Collapse */}
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            style={{
              backgroundColor: '#0F151D',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#1E2A38',
              paddingVertical: 12,
              alignItems: 'center',
              marginTop: 2,
            }}
          >
            <Text style={{ color: '#8FA3B8', fontWeight: '900' }}>
              {expanded ? '기록별 잔디 접기' : '기록별 잔디 펼치기'}
            </Text>
          </Pressable>

          {/* Routine list (expanded) */}
          {expanded && (
            <View style={{ marginTop: 14 }}>
              {GROUPS.map((g) => {
                const list = byGroup.get(g.key) ?? [];
                if (list.length === 0) return null;

                return (
                  <View key={g.key} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: g.color }} />
                      <Text style={{ color: '#EAF2FF', fontSize: 16, fontWeight: '900' }}>{g.name}</Text>
                    </View>

                    {list.map((r) => {
                      const grid = makeRoutineGrid8w(r.id);
                      const p = percent8w(r.id);

                      return (
                        <Pressable
                          key={r.id}
                          onPress={() =>
                            navigation.navigate('RoutineDetail', { routineId: r.id, title: r.title, color: g.color })
                          }
                          style={{
                            backgroundColor: '#121A23',
                            borderRadius: 18,
                            borderWidth: 1,
                            borderColor: '#1E2A38',
                            padding: 14,
                            marginBottom: 12,
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <Text style={{ color: '#EAF2FF', fontSize: 15, fontWeight: '900' }}>{r.title}</Text>
                            <Text style={{ color: '#8FA3B8', fontSize: 12 }}>{p}%</Text>
                          </View>

                          <View style={{ flexDirection: 'row', marginTop: 12, gap: 6 }}>
                            {grid.map((col, w) => (
                              <View key={w} style={{ gap: 6 }}>
                                {col.map((cell, rr) => (
                                  <Pressable
                                    key={`${w}-${rr}`}
                                    onPress={() => {
                                      const label = dayjs(cell.date).format('M/D');
                                      showTip(cell.done ? `${label} 완료` : `${label} 기록 없음`);
                                    }}
                                  >
                                    <View
                                      style={{
                                        width: 11,
                                        height: 11,
                                        borderRadius: 3,
                                        backgroundColor: cell.done ? g.color : '#1A2330',
                                        borderWidth: 1,
                                        borderColor: '#1E2A38',
                                      }}
                                    />
                                  </Pressable>
                                ))}
                              </View>
                            ))}
                          </View>

                          <Text style={{ color: '#8FA3B8', fontSize: 12, marginTop: 12 }}>
                            {g.key === 'breath' ? '회복도 기록이야.' : '많이가 아니라, 계속.'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <Text style={{ color: '#8FA3B8', fontSize: 12, marginTop: 14, lineHeight: 18 }}>
          • 색이 진할수록 그날 더 많이 했어.{'\n'}
          • 전체일 때 점 4색 = 목표 태그 혼합.
        </Text>
      </ScrollView>
    </View>
  );
}
