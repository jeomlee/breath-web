// src/screens/RoutineDetailScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import dayjs from 'dayjs';
import { Calendar } from 'react-native-calendars';
import { supabase } from '../api/supabaseClient';
import type { InsightsStackParamList } from '../navigation/types';

type DailyLogRow = {
  date_key: string;
  routine_id: string | null;
  status: 'done' | 'rest';
};

type CheerRow = {
  id: string;
  message: string | null;
  created_at: string;
  from_user_id: string | null;
  to_user_id: string | null;
  routine_id: string | null;
};

const BG = '#0B0F14';
const CARD = '#121A23';
const LINE = '#1E2A38';
const MUTED = '#8FA3B8';
const TEXT = '#EAF2FF';

const FOCUS = '#4CC9FF';
const REST = '#3BE7B0';

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
  const [cheers, setCheers] = useState<CheerRow[]>([]);
  const [cheerText, setCheerText] = useState('');
  const [tip, setTip] = useState('');
  const tipTimer = useRef<any>(null);

  const weeks = 12;
  const days = weeks * 7;
  const heatStart = dayjs().startOf('day').subtract(days - 1, 'day').format('YYYY-MM-DD');
  const heatEnd = dayjs().startOf('day').format('YYYY-MM-DD');

  const calStart = dayjs().startOf('month').subtract(7, 'day').format('YYYY-MM-DD');
  const calEnd = dayjs().endOf('month').add(7, 'day').format('YYYY-MM-DD');

  const showTip = (text: string) => {
    setTip(text);
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTip(''), 1300);
  };

  const load = async () => {
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

    const { data: cData, error: cErr } = await supabase
      .from('cheers')
      .select('id,message,created_at,from_user_id,to_user_id,routine_id')
      .eq('to_user_id', user.id)
      .eq('routine_id', routineId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (cErr) {
      console.log('[cheers load error]', cErr);
      setCheers([]);
    } else {
      setCheers((cData as any) || []);
    }
  };

  useEffect(() => {
    load();
    return () => {
      if (tipTimer.current) clearTimeout(tipTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusByDate = useMemo(() => {
    const m = new Map<string, 'done' | 'rest'>();
    for (const row of logs) {
      if (!row.date_key) continue;
      if (row.status !== 'done' && row.status !== 'rest') continue;
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

  const stats = useMemo(() => {
    const done = doneSet.size;
    const rest = restSet.size;
    const total = done + rest;
    const focusPct = total <= 0 ? 0 : Math.round((done / total) * 100);
    const restPct = total <= 0 ? 0 : Math.round((rest / total) * 100);
    return { done, rest, total, focusPct, restPct };
  }, [doneSet, restSet]);

  const dayList = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < days; i++) arr.push(dayjs(heatStart).add(i, 'day').format('YYYY-MM-DD'));
    return arr;
  }, [heatStart, days]);

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

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    for (const d of doneSet.values()) {
      marks[d] = { selected: true, selectedColor: FOCUS, selectedTextColor: BG };
    }
    for (const d of restSet.values()) {
      if (marks[d]) continue;
      marks[d] = { selected: true, selectedColor: REST, selectedTextColor: BG };
    }
    return marks;
  }, [doneSet, restSet]);

  const addCheer = async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return;

    const msg = cheerText.trim();
    if (!msg) return;

    const payload = {
      to_user_id: user.id,
      from_user_id: user.id,
      routine_id: routineId,
      message: msg,
    };

    const { error } = await supabase.from('cheers').insert(payload as any);
    if (error) return Alert.alert('응원 추가 실패', error.message);

    setCheerText('');
    showTip('응원이 저장되었습니다.');
    load();
  };

  const ratioColor = useMemo(() => {
    const t = stats.total <= 0 ? 0.5 : stats.done / stats.total; // 0=REST, 1=FOCUS
    return mixHex(REST, FOCUS, t);
  }, [stats.total, stats.done]);

  // ✅ 컨셉 핵심: 과열/느슨 가이드(상단 2카드에서만 사용)
  const guidance = useMemo(() => {
    // 표본이 너무 적을 때는 판단을 약하게
    if (stats.total <= 0) {
      return {
        tone: 'neutral' as const,
        title: '기록이 아직 없습니다.',
        body: '완료이나 휴식 어느 쪽이든, 남기는 것부터 시작해 보시면 좋습니다.',
      };
    }

    // 임계치: 필요하면 조정하세요
    const overheatFocusPct = 80; // 완료 과다
    const tooLooseRestPct = 70;  // 휴식 과다

    if (stats.focusPct >= overheatFocusPct) {
      return {
        tone: 'overheat' as const,
        title: '과열 구간입니다.',
        body: '완료이 아주 잘 이어지고 있습니다. 다만 과열되기 전에 휴식을 한 번 넣어 주시면 더 오래 가실 수 있습니다.',
      };
    }

    if (stats.restPct >= tooLooseRestPct) {
      return {
        tone: 'loose' as const,
        title: '흐름이 조금 느슨해졌습니다.',
        body: '휴식도 유지의 일부입니다. 다만 오늘은 5분만이라도 “시작”으로 흐름을 다시 연결해 보시면 좋습니다.',
      };
    }

    return {
      tone: 'ok' as const,
      title: '균형이 좋습니다.',
      body: '완료과 휴식이 같이 쌓이고 있습니다. 이 흐름 그대로만 가셔도 충분합니다.',
    };
  }, [stats.total, stats.focusPct, stats.restPct]);

  // ✅ 가이드 톤에 맞춘 강조색(카드 내부 텍스트/테두리로만 은근히)
  const guideAccent = useMemo(() => {
    if (guidance.tone === 'overheat') return 'rgba(76,201,255,0.22)'; // FOCUS 계열
    if (guidance.tone === 'loose') return 'rgba(59,231,176,0.18)';     // REST 계열
    return 'rgba(255,255,255,0.10)';
  }, [guidance.tone]);

  const guideBorder = useMemo(() => {
    if (guidance.tone === 'overheat') return 'rgba(76,201,255,0.35)';
    if (guidance.tone === 'loose') return 'rgba(59,231,176,0.28)';
    return 'rgba(31,42,56,1)';
  }, [guidance.tone]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BG }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <ScrollView contentContainerStyle={{ paddingTop: 18, paddingHorizontal: 16, paddingBottom: 24 }}>
        {/* 헤더 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 14,
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: LINE,
            }}
          >
            <Text style={{ color: MUTED, fontWeight: '900' }}>←</Text>
          </Pressable>

          <Text style={{ color: TEXT, fontSize: 16, fontWeight: '900' }} numberOfLines={1}>
            {title}
          </Text>

          <View style={{ width: 44 }} />
        </View>

        {/* ✅ 상단 2카드: 컨셉 반영 재설계 (나머지 유지) */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
          {/* (왼쪽) 밸런스 카드: “과열/느슨” 가이드 */}
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
            <Text style={{ color: MUTED, fontSize: 12 }}>
              최근 {days}일 · 밸런스
            </Text>

            <Text style={{ color: TEXT, fontSize: 14, fontWeight: '900', marginTop: 8 }}>
              {guidance.title}
            </Text>

            <Text style={{ color: MUTED, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
              {guidance.body}
            </Text>

            {/* 기존 막대 유지하되 “설명” 맥락만 바꿈 */}
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

            <Text style={{ color: TEXT, fontWeight: '900', marginTop: 6 }}>
              완료 {stats.focusPct}% · 휴식 {stats.restPct}%
            </Text>
          </View>

          {/* (오른쪽) 요약 카드: “기록은 쌓이되 강박은 최소” */}
          <View
            style={{
              flex: 1,
              backgroundColor: CARD,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: guideBorder, // ✅ 상태에 따라 은근히 변화
              padding: 14,
              overflow: 'hidden',
            }}
          >
            {/* ✅ 은근한 배경 하이라이트 */}
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
              {stats.total <= 0
                ? '아직 기록이 없습니다. 작은 것부터 시작해 보시면 좋습니다.'
                : '완료과 휴식은 모두 “유지”로 기록됩니다.'}
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
                {guidance.tone === 'overheat'
                  ? '권장: 오늘은 “휴식” 1회를 넣어 보세요.'
                  : guidance.tone === 'loose'
                    ? '권장: 오늘은 “완료” 1회를 만들어 보세요.'
                    : '권장: 지금 흐름을 유지해 주세요.'}
              </Text>
              <Text style={{ color: MUTED, fontSize: 11, marginTop: 4, lineHeight: 16 }}>
                {guidance.tone === 'overheat'
                  ? '과열을 막으면 꾸준함이 길어집니다.'
                  : guidance.tone === 'loose'
                    ? '작은 재진입이 흐름을 되살립니다.'
                    : '완벽하지 않아도, 유지가 가장 강력합니다.'}
              </Text>
            </View>
          </View>
        </View>

        {/* 툴팁 */}
        <View style={{ marginBottom: 12 }}>
          <View
            style={{
              backgroundColor: 'rgba(76,201,255,0.10)',
              borderWidth: 1,
              borderColor: 'rgba(76,201,255,0.25)',
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 12,
              minHeight: 34,
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: tip ? FOCUS : MUTED, fontSize: 12, fontWeight: '800' }}>
              {tip || '파랑은 완료, 초록은 휴식입니다. 블록을 누르면 날짜가 표시됩니다.'}
            </Text>
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
                    const bg = cell.status === 'done' ? FOCUS : cell.status === 'rest' ? REST : '#1A2330';
                    return (
                      <Pressable
                        key={`${w}-${r}`}
                        onPress={() =>
                          showTip(
                            `${dayjs(cell.date).format('M/D')} · ${
                              cell.status === 'done' ? '완료' : cell.status === 'rest' ? '휴식' : '미체크'
                            }`
                          )
                        }
                      >
                        <View
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 3,
                            backgroundColor: bg,
                            borderWidth: 1,
                            borderColor: LINE,
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
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: '#1A2330', borderWidth: 1, borderColor: LINE }} />
              <Text style={{ color: MUTED, fontSize: 12, fontWeight: '900' }}>미체크</Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: FOCUS, borderWidth: 1, borderColor: LINE }} />
              <Text style={{ color: MUTED, fontSize: 12, fontWeight: '900' }}>완료</Text>
            </View>
          </View>
        </View>

        {/* 월 캘린더 */}
        <View style={{ backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: LINE, padding: 10, marginBottom: 12 }}>
          <Calendar
            markedDates={markedDates}
            markingType="simple"
            onDayPress={(day) => {
              const st = statusByDate.get(day.dateString);
              showTip(
                `${dayjs(day.dateString).format('M/D')} · ${
                  st === 'done' ? '완료' : st === 'rest' ? '휴식' : '미체크'
                }`
              );
            }}
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

        {/* 응원 섹션 */}
        <View style={{ backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: LINE, padding: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ color: TEXT, fontSize: 14, fontWeight: '900' }}>응원</Text>
            <Text style={{ color: MUTED, fontSize: 12 }}>{cheers.length}개</Text>
          </View>

          <Text style={{ color: MUTED, fontSize: 12, marginTop: 6 }}>
            짧게 한 줄로 남겨 주세요. 본인에게 보내는 메시지입니다.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <TextInput
                value={cheerText}
                onChangeText={setCheerText}
                placeholder="예: 오늘도 도망가지 않으셨습니다."
                placeholderTextColor="#51657A"
                style={{
                  backgroundColor: '#0F1620',
                  borderWidth: 1,
                  borderColor: LINE,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: TEXT,
                  fontWeight: '700',
                }}
              />
            </View>

            <Pressable
              onPress={addCheer}
              style={{
                paddingHorizontal: 14,
                justifyContent: 'center',
                borderRadius: 14,
                backgroundColor: 'rgba(76,201,255,0.16)',
                borderWidth: 1,
                borderColor: 'rgba(76,201,255,0.35)',
              }}
            >
              <Text style={{ color: FOCUS, fontWeight: '900' }}>추가</Text>
            </Pressable>
          </View>

          <View style={{ marginTop: 12, gap: 10 }}>
            {cheers.length === 0 ? (
              <Text style={{ color: MUTED, fontSize: 12 }}>아직 응원이 없습니다. 첫 문장을 남겨 주세요.</Text>
            ) : (
              cheers.map((c) => (
                <View
                  key={c.id}
                  style={{
                    backgroundColor: '#0F1620',
                    borderWidth: 1,
                    borderColor: LINE,
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  <Text style={{ color: TEXT, fontSize: 13, fontWeight: '800' }}>{c.message || '(내용 없음)'}</Text>
                  <Text style={{ color: MUTED, fontSize: 11, marginTop: 6 }}>
                    {dayjs(c.created_at).format('YYYY.MM.DD HH:mm')}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
