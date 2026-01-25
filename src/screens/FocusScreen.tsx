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

export default function FocusScreen() {
  const [mode, setMode] = useState<'focus' | 'rest'>('focus');
  const ACCENT = mode === 'rest' ? GREEN : BLUE;

  const [minutes, setMinutes] = useState(5);
  const [seconds, setSeconds] = useState(0);
  const configuredTotal = useMemo(() => minutes * 60 + seconds, [minutes, seconds]);

  const [remaining, setRemaining] = useState(configuredTotal);
  const [running, setRunning] = useState(false);

  const [settingOpen, setSettingOpen] = useState(false);
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

  const vibrateFinish = () => {
    try {
      Vibration.vibrate([0, 180, 80, 180, 80, 240]);
    } catch {}
  };

  useEffect(() => {
    if (!running) setRemaining(configuredTotal);
  }, [configuredTotal, running]);

  useEffect(() => {
    if (!running) return;
    tickRef.current = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [running]);

  useEffect(() => {
    if (!running || remaining > 0) return;
    setRunning(false);
    vibrateFinish();
    Alert.alert('세션이 완료되었습니다');
  }, [remaining, running]);

  const start = () => {
    if (configuredTotal <= 0 || running) return;
    if (remaining <= 0) setRemaining(configuredTotal);
    setRunning(true);
  };

  const pause = () => {
    if (!running) return;
    setRunning(false);
  };

  const reset = () => {
    setRunning(false);
    setRemaining(configuredTotal);
  };

  const setQuick = (sec: number) => {
    if (running) return;
    setMinutes(Math.floor(sec / 60));
    setSeconds(sec % 60);
    setRemaining(sec);
  };

  const openSetting = () => {
    setMPick(minutes);
    setSPick(seconds);
    setSettingOpen(true);
  };

  const applySetting = () => {
    const m = clamp(mPick, 0, 999);
    const s = clamp(sPick, 0, 59);
    setMinutes(m);
    setSeconds(s);
    setRemaining(m * 60 + s);
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
  const trackWRef = useRef(0);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: mode === 'rest' ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [mode, slide]);

  const onTrackLayout = (e: any) => {
    trackWRef.current = e?.nativeEvent?.layout?.width ?? 0;
  };

  // 필의 이동 거리: (트랙 너비 - 양옆 패딩*2 - 필너비) / 1  (2분할이라 = half)
  const pillTranslateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1], // 실제 값은 렌더 시 계산해서 transform에 넣기 어려움 → 아래에서 Animated multiply 방식 사용
  });

  // Animated로 “정확한 px”을 넣으려면, trackWidth가 필요해서 아래처럼 계산:
  // tx = slide * (innerWidth/2)
  const tx = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 100], // 임시값, 렌더에서 width 측정 후 setValue로 재설정
  });

  // trackW가 바뀌면 outputRange를 갱신하기 위해 별도 Animated.Value로 다시 세팅
  const txRef = useRef(tx);
  const [txAnim, setTxAnim] = useState(txRef.current);

  useEffect(() => {
    // track width 측정 후에 정확한 이동거리 계산해서 interpolate 다시 만들기
    const w = trackWRef.current;
    if (!w) return;
    const inner = Math.max(0, w - SEG_PAD * 2);
    const half = inner / 2;

    const nextTx = slide.interpolate({
      inputRange: [0, 1],
      outputRange: [0, half],
    });
    txRef.current = nextTx;
    setTxAnim(nextTx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackWRef.current]);

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
            {mode === 'rest' ? '휴식도 중요합니다' : '짧아도 괜찮답니다'}
          </T>
        </View>

        {/* 모드 (✅ 1번: 슬라이딩 인디케이터 세그먼트) */}
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
              opacity: running ? 0.65 : 1,
            }}
          >
            {/* 슬라이딩 필 */}
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

            {/* 버튼 2개 */}
            <Pressable
              disabled={running}
              onPress={() => setMode('focus')}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 14,
              }}
            >
              <T style={{ color: mode === 'focus' ? ACCENT : MUTED, fontWeight: '900' }}>집중</T>
            </Pressable>

            <Pressable
              disabled={running}
              onPress={() => setMode('rest')}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 14,
              }}
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
          {/* ✅ 카드 우측 상단: 시간 설정 */}
          <View style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
            <Pressable
              onPress={openSetting}
              disabled={running}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 999,
                backgroundColor: '#0E141C',
                borderWidth: 1,
                borderColor: LINE,
                opacity: running ? 0.6 : 1,
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
                onPress={() => (running ? pause() : start())}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 16,
                  alignItems: 'center',
                  backgroundColor: `${ACCENT}2E`,
                  borderWidth: 1,
                  borderColor: `${ACCENT}59`,
                }}
              >
                <T style={{ color: ACCENT, fontWeight: '900' }}>{running ? '일시정지' : '시작'}</T>
              </Pressable>

              <Pressable
                onPress={reset}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 16,
                  alignItems: 'center',
                  backgroundColor: '#0E141C',
                  borderWidth: 1,
                  borderColor: LINE,
                }}
              >
                <T style={{ color: MUTED, fontWeight: '900' }}>리셋</T>
              </Pressable>
            </View>

            {/* 빠른 시간 */}
            <T style={{ color: MUTED, fontWeight: '900', marginTop: 14, fontSize: 11 }}>빠른 시간</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 8 }}>
              {quicks.map((q) => (
                <Pressable
                  key={q.label}
                  onPress={() => setQuick(q.sec)}
                  disabled={running}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    backgroundColor: '#0E141C',
                    borderWidth: 1,
                    borderColor: LINE,
                    opacity: running ? 0.6 : 1,
                  }}
                >
                  <T style={{ color: MUTED, fontWeight: '900', fontSize: 11 }}>{q.label}</T>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>

        {/* 설정 모달 (유지) */}
        <Modal transparent visible={settingOpen} animationType="fade" onRequestClose={() => setSettingOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setSettingOpen(false)} />
          <View style={styles.modalCenter}>
            <View style={styles.modalCard}>
              <T style={{ color: TEXT, fontSize: 18, fontWeight: '900' }}>시간 설정</T>
              <T style={{ color: MUTED, marginTop: 6 }}>휠로 시간을 맞춰주세요.</T>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
                <Wheel values={MINUTES} value={mPick} onChange={setMPick} />
                <Wheel values={SECONDS} value={sPick} onChange={setSPick} />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Pressable onPress={() => setSettingOpen(false)} style={styles.modalBtn}>
                  <T style={{ color: MUTED, fontWeight: '900' }}>취소</T>
                </Pressable>
                <Pressable onPress={applySetting} style={[styles.modalBtn, { backgroundColor: `${ACCENT}2E`, borderColor: `${ACCENT}59` }]}>
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
    backgroundColor: '#0E141C',
    borderWidth: 1,
    borderColor: LINE,
  },
});
