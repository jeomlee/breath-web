import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

type Props = {
  title: string;
  done?: boolean;
  onPressDone?: () => void;
};

export default function RoutineCard({ title, done = false, onPressDone }: Props) {
  return (
    <View
      style={{
        backgroundColor: '#121A23',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#1E2A38',
        paddingVertical: 14,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: '#EAF2FF', fontSize: 16, fontWeight: '800' }}>
          {title}
        </Text>
        <Text style={{ color: '#8FA3B8', marginTop: 6, fontSize: 12 }}>
          {done ? '오늘은 이미 해냈어.' : '딱 하나만 해도 돼.'}
        </Text>
      </View>

      <TouchableOpacity
        onPress={onPressDone}
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: done ? '#4CC9FF' : '#2A3A4D',
          backgroundColor: done ? 'rgba(76,201,255,0.12)' : 'transparent',
        }}
        accessibilityRole="button"
      >
        <Text style={{ color: done ? '#4CC9FF' : '#8FA3B8', fontSize: 18, fontWeight: '900' }}>
          {done ? '✓' : '○'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
