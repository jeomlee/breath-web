// src/utils/disableFontScaling.ts
import { Text, TextInput } from 'react-native';

/**
 * ✅ 시스템 폰트 크기(Accessibility / Display size)에 따른
 * 레이아웃 깨짐을 방지하기 위해 전역적으로 폰트 스케일을 무시합니다.
 *
 * 주의: 접근성(큰 글씨) 지원이 줄어듭니다.
 * 앱 정책상 "레이아웃 고정"이 우선인 경우에만 사용하세요.
 */
export function disableFontScalingGlobally() {
  // Text
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TextAny: any = Text;
  if (!TextAny.defaultProps) TextAny.defaultProps = {};
  TextAny.defaultProps.allowFontScaling = false;

  // TextInput
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TextInputAny: any = TextInput;
  if (!TextInputAny.defaultProps) TextInputAny.defaultProps = {};
  TextInputAny.defaultProps.allowFontScaling = false;
}
