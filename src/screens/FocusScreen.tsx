// src/screens/FocusScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text as RNText,
  Pressable,
  Modal,
  Alert,
  ScrollView,
  StyleSheet,
  Vibration,
  type TextProps,
  Animated,
  Easing,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import ScreenContainer from '../components/ScreenContainer';
import { Wheel } from '../components/Wheel';

const BG = '#0B0F14';
const CARD = '#121A23';
const LINE = '#1E2A38';
const MUTED = '#8FA3B8';
const TEXT = '#EAF2FF';

const BLUE = '#4CC9FF';
const GREEN = '#3BE7B0';

/** ✅ 시스템 글씨 크기 영향 차단 */
function T(props: TextProps) {
  return <RNText {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}

function pad2(n: number) {
  return String(Math.max(0, n)).padStart(2, '0');
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type Phase = 'idle' | 'running' | 'paused' | 'done';

export default function FocusScreen() {
  const [mode, setMode] = useState<'focus' | 'rest'>('focus');
  const ACCENT = mode === 'rest' ? GREEN : BLUE;

  // ✅ 설정값(휠)
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const configuredTotal = useMemo(() => minutes * 60 + seconds, [minutes, seconds]);

  // ✅ 상태머신
  const [phase, setPhase] = useState<Phase>('idle');
  const running = phase === 'running';
  const locked = phase !== 'idle'; // idle이 아닐 때는 설정 변경/빠른 시간/모드 변경 잠금

  const [remaining, setRemaining] = useState(configuredTotal);
  const [settingOpen, setSettingOpen] = useState(false);

  // ✅ 모달 휠 값(픽커)
  const [mPick, setMPick] = useState(minutes);
  const [sPick, setSPick] = useState(seconds);

  const tickRef = useRef<any>(null);

  const MINUTES = useMemo(() => Array.from({ length: 121 }, (_, i) => i), []);
  const SECONDS = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const quicks = useMemo(
    () => [
      { label: '30초', sec: 30 },
      { label: '1분', sec: 60 },
      { label: '5분', sec: 300 },
      { label: '10분', sec: 600 },
      { label: '15분', sec: 900 },
      { label: '30분', sec: 1800 },
      { label: '1시간', sec: 3600 },
    ],
    []
  );

  // ✅ 종료 진동 강화 (여러 번)
  const finishVibeRef = useRef<any>(null);
  const vibrateFinish = () => {
    try {
      if (finishVibeRef.current) {
        clearTimeout(finishVibeRef.current);
        finishVibeRef.current = null;
      }

      Vibration.vibrate([0, 220, 120, 220, 120, 260, 140, 260, 140, 320]);

      finishVibeRef.current = setTimeout(() => {
        try {
          Vibration.vibrate(300);
        } catch {}
      }, 520);
    } catch {}
  };

  // ✅ 핵심: "설정 변경 시 remaining 동기화"는 오직 idle에서만
  // (paused에서 running=false라고 리셋되면 안 됨)
  useEffect(() => {
    if (phase === 'idle') setRemaining(configuredTotal);
  }, [configuredTotal, phase]);

  // ✅ running일 때만 interval
  useEffect(() => {
    if (phase !== 'running') return;

    tickRef.current = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [phase]);

  // ✅ 완료 처리
  useEffect(() => {
    if (phase !== 'running') return;
    if (remaining > 0) return;

    // 끝났으면 즉시 멈추고 done으로
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setPhase('done');
    vibrateFinish();
    Alert.alert('세션이 완료되었습니다');
  }, [remaining, phase]);

  // ✅ 언마운트 정리
  useEffect(() => {
    return () => {
      if (finishVibeRef.current) {
        clearTimeout(finishVibeRef.current);
        finishVibeRef.current = null;
      }
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, []);

  const startOrResume = () => {
    if (configuredTotal <= 0) return; // 0:0이면 시작 불가

    // paused면 그대로 재개
    if (phase === 'paused') {
      setPhase('running');
      return;
    }

    // done이면 설정값으로 복귀 후 시작
    if (phase === 'done') {
      setRemaining(configuredTotal);
      setPhase('running');
      return;
    }

    // idle이면 설정값으로 시작
    if (phase === 'idle') {
      setRemaining(configuredTotal);
      setPhase('running');
    }
  };

  const pause = () => {
    if (phase !== 'running') return;

    // ✅ 즉시 interval 정리(체감상 '딱 멈춤')
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }

    setPhase('paused');
  };

  /**
   * ✅ Reset (권장 UX = A): "현재 설정한 시간으로 되돌리기"
   */
  const reset = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setPhase('idle');
    setRemaining(configuredTotal);
  };

  /**
   * ✅ Clear (B는 롱프레스): 설정 자체 0:0 초기화
   */
  const clearSetting = () => {
    if (locked) return;
    Alert.alert('시간을 초기화할까요?', '분/초 설정을 0:0으로 되돌립니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '초기화',
        style: 'destructive',
        onPress: () => {
          setMinutes(0);
          setSeconds(0);
          // idle이라 remaining은 useEffect로 자동 동기화됨
        },
      },
    ]);
  };

  const setQuick = (sec: number) => {
    if (locked) return;
    setMinutes(Math.floor(sec / 60));
    setSeconds(sec % 60);
  };

  const openSetting = () => {
    if (locked) return;
    setMPick(minutes);
    setSPick(seconds);
    setSettingOpen(true);
  };

  const applySetting = () => {
    const m = clamp(mPick, 0, 120);
    const s = clamp(sPick, 0, 59);
    setMinutes(m);
    setSeconds(s);
    setSettingOpen(false);
  };

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;

  const size = 280;
  const stroke = 16;
  const rr = (size - stroke) / 2;
  const c = 2 * Math.PI * rr;
  const ratio = configuredTotal <= 0 ? 0 : remaining / configuredTotal;
  const dashOffset = c * (1 - ratio);

  /** ✅ 세션 모드: 슬라이딩 인디케이터(필) */
  const SEG_H = 46;
  const SEG_PAD = 6;

  const slide = useRef(new Animated.Value(mode === 'rest' ? 1 : 0)).current;
  const [trackW, setTrackW] = useState(0);
  const [txAnim, setTxAnim] = useState<any>(slide.interpolate({ inputRange: [0, 1], outputRange: [0, 0] }));

  useEffect(() => {
    Animated.timing(slide, {
      toValue: mode === 'rest' ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [mode, slide]);

  const onTrackLayout = (e: any) => {
    setTrackW(e?.nativeEvent?.layout?.width ?? 0);
  };

  useEffect(() => {
    if (!trackW) return;
    const inner = Math.max(0, trackW - SEG_PAD * 2);
    const half = inner / 2;

    const nextTx = slide.interpolate({
      inputRange: [0, 1],
      outputRange: [0, half],
    });
    setTxAnim(nextTx);
  }, [trackW, slide]);

  const primaryLabel = phase === 'running' ? '일시정지' : phase === 'paused' ? '재개' : '시작';

  return (
    <ScreenContainer bg={BG} barStyle="light-content">
      <ScrollView
        contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!settingOpen}
      >
        {/* 헤더 */}
        <View>
          <T style={{ color: TEXT, fontSize: 30, fontWeight: '900' }}>Focus</T>
          <T style={{ color: MUTED, marginTop: 6 }}>
            {mode === 'rest' ? '휴식도 중요합니다 잊지마세요' : '짧아도 괜찮답니다 호흡에 집중해보세요'}
          </T>
        </View>

        {/* 모드 */}
        <View
          style={{
            marginTop: 12,
            backgroundColor: CARD,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: LINE,
            padding: 12,
          }}
        >
          <T style={{ color: MUTED, fontWeight: '900' }}>세션 모드</T>

          <View
            onLayout={onTrackLayout}
            style={{
              marginTop: 10,
              height: SEG_H,
              borderRadius: 16,
              backgroundColor: '#0E141C',
              borderWidth: 1,
              borderColor: LINE,
              padding: SEG_PAD,
              flexDirection: 'row',
              position: 'relative',
              overflow: 'hidden',
              opacity: locked ? 0.65 : 1,
            }}
          >
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: SEG_PAD,
                left: SEG_PAD,
                height: SEG_H - SEG_PAD * 2,
                width: '50%',
                borderRadius: 14,
                backgroundColor: `${ACCENT}2E`,
                borderWidth: 1,
                borderColor: `${ACCENT}59`,
                transform: [{ translateX: txAnim }],
              }}
            />

            <Pressable
              disabled={locked}
              onPress={() => setMode('focus')}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 14 }}
            >
              <T style={{ color: mode === 'focus' ? ACCENT : MUTED, fontWeight: '900' }}>집중</T>
            </Pressable>

            <Pressable
              disabled={locked}
              onPress={() => setMode('rest')}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 14 }}
            >
              <T style={{ color: mode === 'rest' ? ACCENT : MUTED, fontWeight: '900' }}>휴식</T>
            </Pressable>
          </View>
        </View>

        {/* 타이머 카드 */}
        <View
          style={{
            marginTop: 12,
            backgroundColor: CARD,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: LINE,
            padding: 16,
          }}
        >
          {/* 우측 상단: 시간 설정 */}
          <View style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
            <Pressable
              onPress={openSetting}
              disabled={locked}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 999,
                backgroundColor: '#0E141C',
                borderWidth: 1,
                borderColor: LINE,
                opacity: locked ? 0.6 : 1,
              }}
            >
              <T style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>시간 설정</T>
            </Pressable>
          </View>

          <View style={{ alignItems: 'center' }}>
            <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={size} height={size}>
                <Circle cx={size / 2} cy={size / 2} r={rr} stroke="#0E141C" strokeWidth={stroke} />
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  r={rr}
                  stroke={ACCENT}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${c} ${c}`}
                  strokeDashoffset={dashOffset}
                  rotation={-90}
                  originX={size / 2}
                  originY={size / 2}
                />
              </Svg>

              <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
                <T style={{ color: MUTED, fontWeight: '900' }}>남은 시간</T>
                <T style={{ color: TEXT, fontSize: 56, fontWeight: '900', marginTop: 6 }}>
                  {pad2(mm)}:{pad2(ss)}
                </T>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, width: '100%' }}>
              <Pressable
                onPress={() => (phase === 'running' ? pause() : startOrResume())}
                disabled={configuredTotal <= 0}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center', // ✅ 세로 중앙
                  backgroundColor: `${ACCENT}2E`,
                  borderWidth: 1,
                  borderColor: `${ACCENT}59`,
                  opacity: configuredTotal <= 0 ? 0.45 : 1,
                }}
              >
                <T style={{ color: ACCENT, fontWeight: '900' }}>{primaryLabel}</T>
              </Pressable>

              <Pressable
                onPress={reset}
                onLongPress={clearSetting}
                delayLongPress={450}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#0E141C',
                  borderWidth: 1,
                  borderColor: LINE,
                }}
              >
                <T style={{ color: MUTED, fontWeight: '900' }}>리셋</T>
                <T style={{ color: MUTED, fontSize: 10, marginTop: 4, opacity: 0.7 }}>길게: 초기화</T>
              </Pressable>
            </View>

            {/* 빠른 시간 */}
            <T style={{ color: MUTED, fontWeight: '900', marginTop: 14, fontSize: 11 }}>빠른 시간</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 8 }}>
              {quicks.map((q) => (
                <Pressable
                  key={q.label}
                  onPress={() => setQuick(q.sec)}
                  disabled={locked}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    backgroundColor: '#0E141C',
                    borderWidth: 1,
                    borderColor: LINE,
                    opacity: locked ? 0.6 : 1,
                  }}
                >
                  <T style={{ color: MUTED, fontWeight: '900', fontSize: 11 }}>{q.label}</T>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>

        {/* 설정 모달 */}
        <Modal transparent visible={settingOpen} animationType="fade" onRequestClose={() => setSettingOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setSettingOpen(false)} />
          <View style={styles.modalCenter}>
            <View style={styles.modalCard}>
              <T style={{ color: TEXT, fontSize: 18, fontWeight: '900' }}>시간 설정</T>
              <T style={{ color: MUTED, marginTop: 6 }}>휠로 시간을 맞춰주세요.</T>

              <View style={{ marginTop: 14, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ alignItems: 'center' }}>
                    <T style={{ color: MUTED, fontWeight: '900', marginBottom: 8, fontSize: 12 }}>분</T>
                    <Wheel values={MINUTES} value={mPick} onChange={setMPick} width={132} itemHeight={44} visibleCount={5} />
                  </View>

                  <View style={{ alignItems: 'center' }}>
                    <T style={{ color: MUTED, fontWeight: '900', marginBottom: 8, fontSize: 12 }}>초</T>
                    <Wheel values={SECONDS} value={sPick} onChange={setSPick} width={132} itemHeight={44} visibleCount={5} />
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Pressable onPress={() => setSettingOpen(false)} style={styles.modalBtn}>
                  <T style={{ color: MUTED, fontWeight: '900' }}>취소</T>
                </Pressable>
                <Pressable
                  onPress={applySetting}
                  style={[styles.modalBtn, { backgroundColor: `${ACCENT}2E`, borderColor: `${ACCENT}59` }]}
                >
                  <T style={{ color: ACCENT, fontWeight: '900' }}>적용</T>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalCenter: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: CARD,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: LINE,
    padding: 16,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E141C',
    borderWidth: 1,
    borderColor: LINE,
  },
});
