// src/components/Wheel.tsx
import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  PanResponder,
  Animated,
  LayoutChangeEvent,
} from 'react-native';

const ITEM_H = 44;
const VISIBLE = 5;
const SPACER_H = ((VISIBLE - 1) / 2) * ITEM_H;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function pad2(n: number) {
  return String(Math.max(0, n)).padStart(2, '0');
}

type Props = {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  activeColor?: string;
  mutedColor?: string;
  textColor?: string;
  bgColor?: string;
  lineColor?: string;
};

export function Wheel({
  values,
  value,
  onChange,
  activeColor = 'rgba(76,201,255,0.22)',
  mutedColor = '#8FA3B8',
  textColor = '#EAF2FF',
  bgColor = '#0E141C',
  lineColor = '#1E2A38',
}: Props) {
  const maxIdx = Math.max(0, values.length - 1);

  const activeIdx = useMemo(() => {
    const i = values.indexOf(value);
    return i >= 0 ? i : 0;
  }, [values, value]);

  const translateY = useRef(new Animated.Value(-activeIdx * ITEM_H)).current;

  const yRef = useRef(-activeIdx * ITEM_H);
  const startYRef = useRef(0);
  const isDraggingRef = useRef(false);

  const minY = useMemo(() => -maxIdx * ITEM_H, [maxIdx]);
  const maxY = 0;

  // keep yRef synced (native driver에서도 값 추적)
  useEffect(() => {
    const id = translateY.addListener(({ value: y }) => {
      yRef.current = y;
    });
    return () => translateY.removeListener(id);
  }, [translateY]);

  const snapToIndex = (idx: number, animated: boolean) => {
    const clampedIdx = clamp(idx, 0, maxIdx);
    const nextY = -clampedIdx * ITEM_H;

    if (animated) {
      Animated.timing(translateY, {
        toValue: nextY,
        duration: 180,
        useNativeDriver: true,
      }).start();
    } else {
      translateY.setValue(nextY);
    }

    onChange(values[clampedIdx]);
  };

  // 외부 value 변경 시(모달 열기/초기화 등) 위치 동기화
  useEffect(() => {
    if (isDraggingRef.current) return;
    const nextY = -activeIdx * ITEM_H;
    Animated.timing(translateY, {
      toValue: nextY,
      duration: 160,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, maxIdx]);

  const stopAndSnap = () => {
    translateY.stopAnimation((y) => {
      const clampedY = clamp(y, minY, maxY);
      const idx = clamp(Math.round(-clampedY / ITEM_H), 0, maxIdx);
      snapToIndex(idx, true);
    });
  };

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: () => {
        isDraggingRef.current = true;
        translateY.stopAnimation((y) => {
          startYRef.current = y;
        });
      },

      onPanResponderMove: (_evt, g) => {
        // 손가락 이동을 그대로 반영하되, 경계 밖에서는 저항(ios 느낌)
        const raw = startYRef.current + g.dy;
        let next = raw;

        if (raw > maxY) {
          next = maxY + (raw - maxY) * 0.25;
        } else if (raw < minY) {
          next = minY + (raw - minY) * 0.25;
        }
        translateY.setValue(next);
      },

      onPanResponderRelease: (_evt, g) => {
        isDraggingRef.current = false;

        // 관성 (감속)
        // velocityY: 아래로 내리면 + (translateY는 증가)
        const vy = g.vy;

        // decay로 자연스럽게 흘려보낸 다음 스냅
        Animated.decay(translateY, {
          velocity: vy,
          deceleration: 0.995,
          useNativeDriver: true,
        }).start(() => {
          stopAndSnap();
        });

        // decay가 끝나기 전에 오래 걸리는 케이스 대비: 380ms 후 스냅 보장
        setTimeout(() => {
          if (!isDraggingRef.current) stopAndSnap();
        }, 380);
      },

      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        stopAndSnap();
      },
    });
  }, [minY, maxY, maxIdx]);

  // iOS-style: 각 아이템이 중앙에서 멀수록 작아지고 흐려짐
  const centerY = SPACER_H; // 중앙 라인의 top
  const makeItemStyle = (i: number) => {
    const itemTop = SPACER_H + i * ITEM_H;

    const inputRange = [
      -(itemTop - centerY) - ITEM_H * 2,
      -(itemTop - centerY) - ITEM_H,
      -(itemTop - centerY),
      -(itemTop - centerY) + ITEM_H,
      -(itemTop - centerY) + ITEM_H * 2,
    ];

    const scale = translateY.interpolate({
      inputRange,
      outputRange: [0.82, 0.9, 1.0, 0.9, 0.82],
      extrapolate: 'clamp',
    });

    const opacity = translateY.interpolate({
      inputRange,
      outputRange: [0.18, 0.45, 1.0, 0.45, 0.18],
      extrapolate: 'clamp',
    });

    return { transform: [{ scale }], opacity };
  };

  const onPressItem = (i: number) => {
    snapToIndex(i, true);
  };

  return (
    <View
      style={[
        styles.viewport,
        {
          backgroundColor: bgColor,
          borderColor: lineColor,
        },
      ]}
      {...panResponder.panHandlers}
    >
      {/* 중앙 선택 라인 */}
      <View
        pointerEvents="none"
        style={[
          styles.centerLine,
          {
            top: SPACER_H,
            borderColor: activeColor,
            backgroundColor: 'rgba(255,255,255,0.04)',
          },
        ]}
      />

      {/* 리스트 */}
      <Animated.View
        style={{
          paddingVertical: SPACER_H,
          transform: [{ translateY }],
        }}
      >
        {values.map((v, i) => {
          const isActive = i === activeIdx;
          const anim = makeItemStyle(i);

          return (
            <Pressable key={String(v)} onPress={() => onPressItem(i)} style={styles.item}>
              <Animated.View style={anim}>
                <Text
                  style={{
                    color: isActive ? textColor : mutedColor,
                    fontSize: isActive ? 22 : 18,
                    fontWeight: '900',
                    includeFontPadding: false,
                  }}
                >
                  {pad2(v)}
                </Text>
              </Animated.View>
            </Pressable>
          );
        })}
      </Animated.View>

      {/* 상/하 페이드 (그라데이션 대체 오버레이) */}
      <View pointerEvents="none" style={[styles.fadeTop, { backgroundColor: bgColor }]} />
      <View pointerEvents="none" style={[styles.fadeBottom, { backgroundColor: bgColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    height: ITEM_H * VISIBLE,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden', // ✅ 이제 안전하게 클리핑 (모달 카드 overflow visible로 해결됨)
  },
  centerLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: ITEM_H,
    borderRadius: 14,
    borderWidth: 1,
    zIndex: 2,
  },
  item: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fadeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: ITEM_H * 1.3,
    opacity: 0.95,
  },
  fadeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: ITEM_H * 1.3,
    opacity: 0.95,
  },
});
