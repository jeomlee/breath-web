// src/components/ScreenContainer.tsx
import React, { useCallback } from 'react';
import { View, ViewStyle, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
  bg?: string;
  barStyle?: 'light-content' | 'dark-content';
};

const DEFAULT_BG = '#0B0F14';

export default function ScreenContainer({
  children,
  style,
  bg = DEFAULT_BG,
  barStyle = 'light-content',
}: Props) {
  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle(barStyle, true);

      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor(bg, true);
        StatusBar.setTranslucent(false);
      }
    }, [barStyle, bg])
  );

  return (
    // ✅ bottom safe-area는 제외 (탭바가 자체로 처리하므로 중복 방지)
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={['top', 'left', 'right']}>
      <View style={[{ flex: 1, backgroundColor: bg }, style]}>{children}</View>
    </SafeAreaView>
  );
}
