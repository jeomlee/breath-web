// src/components/Wheel.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, FlatList, Pressable, Text as RNText, Platform } from 'react-native';

type Props = {
  values: number[];
  value: number;
  onChange: (v: number) => void;

  width?: number;
  itemHeight?: number;
  visibleCount?: number; // 홀수 권장 (5/7)
};

function T(props: any) {
  return <RNText {...props} allowFontScaling={false} maxFontSizeMultiplier={1} />;
}

export function Wheel({
  values,
  value,
  onChange,
  width = 132,
  itemHeight = 44,
  visibleCount = 5,
}: Props) {
  const listRef = useRef<FlatList<number>>(null);

  const pad = Math.floor(visibleCount / 2);
  const height = itemHeight * visibleCount;

  // ✅ 앞/뒤 패딩(더미)
  const data = useMemo(() => {
    const head = Array.from({ length: pad }, () => -1);
    const tail = Array.from({ length: pad }, () => -1);
    return [...head, ...values, ...tail];
  }, [pad, values]);

  // ✅ value가 values 안에 없으면 기본값 보정
  const safeValue = useMemo(() => {
    if (!values.length) return 0;
    return values.includes(value) ? value : values[0];
  }, [value, values]);

  // ✅ data에서 safeValue의 절대 인덱스
  const targetIndex = useMemo(() => {
    const vIdx = values.indexOf(safeValue);
    return vIdx < 0 ? pad : pad + vIdx;
  }, [pad, safeValue, values]);

  const [activeIndex, setActiveIndex] = useState(targetIndex);

  // ✅ setState 폭주 방지용 ref
  const activeRef = useRef(activeIndex);
  useEffect(() => {
    activeRef.current = activeIndex;
  }, [activeIndex]);

  // ✅ 오프셋 계산
  const offsetForIndex = useCallback(
    (index: number) => Math.max(0, (index - pad) * itemHeight),
    [pad, itemHeight]
  );

  const scrollToIndexCentered = useCallback(
    (index: number, animated: boolean) => {
      listRef.current?.scrollToOffset({
        offset: offsetForIndex(index),
        animated,
      });
    },
    [offsetForIndex]
  );

  const minIndex = pad;
  const maxIndex = pad + Math.max(0, values.length - 1);
  const clampIndex = useCallback(
    (idx: number) => Math.max(minIndex, Math.min(maxIndex, idx)),
    [minIndex, maxIndex]
  );

  const indexFromOffset = useCallback(
    (y: number) => clampIndex(Math.round(y / itemHeight) + pad),
    [clampIndex, itemHeight, pad]
  );

  const commitFromOffset = useCallback(
    (y: number, snap: boolean) => {
      const idx = indexFromOffset(y);
      const picked = values[idx - pad];

      // activeIndex는 필요할 때만 갱신
      if (idx !== activeRef.current) {
        activeRef.current = idx;
        setActiveIndex(idx);
      }

      if (snap) {
        const ty = offsetForIndex(idx);
        if (Math.abs(ty - y) > 0.5) {
          scrollToIndexCentered(idx, true);
        }
      }

      if (picked !== safeValue) onChange(picked);
    },
    [indexFromOffset, values, pad, offsetForIndex, scrollToIndexCentered, safeValue, onChange]
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: itemHeight,
      offset: itemHeight * index,
      index,
    }),
    [itemHeight]
  );

  // ✅ 외부 value 변경 → 중앙으로 이동 (contentOffset 쓰지 말 것)
  useEffect(() => {
    // 이미 맞으면 아무 것도 안 함
    if (targetIndex === activeRef.current) {
      // 그래도 위치가 틀어질 수 있어, 한 번만 보정(가볍게)
      requestAnimationFrame(() => scrollToIndexCentered(targetIndex, false));
      return;
    }

    activeRef.current = targetIndex;
    setActiveIndex(targetIndex);

    requestAnimationFrame(() => {
      scrollToIndexCentered(targetIndex, false);
    });
  }, [targetIndex, scrollToIndexCentered]);

  // ✅ initialScrollIndex는 getItemLayout이 있으면 안전한 편 (fallback도 추가)
  const initialScrollIndex = useMemo(() => {
    const idx = Math.max(0, Math.min(data.length - 1, targetIndex));
    return idx;
  }, [data.length, targetIndex]);

  return (
    <View
      style={{
        width,
        height,
        borderRadius: 16,
        backgroundColor: '#0E141C',
        borderWidth: 1,
        borderColor: '#1E2A38',
        overflow: 'hidden',
      }}
    >
      {/* ✅ 가운데 선택 영역 */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          top: itemHeight * pad,
          height: itemHeight,
          borderRadius: 12,
          backgroundColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.14)',
        }}
      />

      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(_, i) => String(i)}
        getItemLayout={getItemLayout}
        initialScrollIndex={initialScrollIndex}
        onScrollToIndexFailed={(info) => {
          // RN에서 가끔 initialScrollIndex 실패할 때 대비
          const y = info.averageItemLength * info.index;
          requestAnimationFrame(() => {
            listRef.current?.scrollToOffset({ offset: y, animated: false });
          });
        }}
        initialNumToRender={Math.max(visibleCount + 2, 10)}
        windowSize={9}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        snapToInterval={itemHeight}
        snapToAlignment="start"
        decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.98}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const y = e?.nativeEvent?.contentOffset?.y ?? 0;
          commitFromOffset(y, true);
        }}
        onScrollEndDrag={(e) => {
          const y = e?.nativeEvent?.contentOffset?.y ?? 0;
          commitFromOffset(y, true);
        }}
        onScroll={(e) => {
          const y = e?.nativeEvent?.contentOffset?.y ?? 0;
          const idx = indexFromOffset(y);

          // ✅ 스크롤 중 상태 표시만(필요할 때만)
          if (idx !== activeRef.current) {
            activeRef.current = idx;
            setActiveIndex(idx);
          }
        }}
        renderItem={({ item, index }) => {
          const isPadItem = item === -1;
          const isActive = index === activeRef.current; // ref 기준으로 깜빡임 줄이기

          return (
            <Pressable
              disabled={isPadItem}
              onPress={() => {
                if (isPadItem) return;
                const vIndex = values.indexOf(item);
                if (vIndex < 0) return;

                const idx = pad + vIndex;

                if (idx !== activeRef.current) {
                  activeRef.current = idx;
                  setActiveIndex(idx);
                }

                scrollToIndexCentered(idx, true);
                if (item !== safeValue) onChange(item);
              }}
              style={{
                height: itemHeight,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isPadItem ? 0 : 1,
              }}
            >
              <T
                style={{
                  color: isActive ? '#EAF2FF' : '#8FA3B8',
                  fontWeight: isActive ? '900' : '800',
                  fontSize: 18,
                  includeFontPadding: false,
                }}
              >
                {isPadItem ? '' : item}
              </T>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
