// src/utils/lockFontScale.ts
import { Text, TextInput } from 'react-native';

type AnyComp = any;

/**
 * ✅ 시스템 글자 크기(폰트 스케일) 영향 완전 차단
 * - allowFontScaling=false
 * - maxFontSizeMultiplier=1
 * - defaultProps가 먹지 않는 경우까지 대비해서 Text/TextInput render를 래핑
 */
export function lockFontScaleGlobally() {
  // 1) defaultProps (기본 차단)
  const TextAny: AnyComp = Text;
  TextAny.defaultProps = TextAny.defaultProps || {};
  TextAny.defaultProps.allowFontScaling = false;
  TextAny.defaultProps.maxFontSizeMultiplier = 1;

  const TextInputAny: AnyComp = TextInput;
  TextInputAny.defaultProps = TextInputAny.defaultProps || {};
  TextInputAny.defaultProps.allowFontScaling = false;
  TextInputAny.defaultProps.maxFontSizeMultiplier = 1;

  // 2) render 래핑 (defaultProps가 무시되는 환경 대비)
  // - 이미 패치됐으면 중복 패치 방지
  if (!TextAny.__FONT_SCALE_LOCKED__) {
    const oldRender = TextAny.render;
    TextAny.render = function render(...args: any[]) {
      const origin = oldRender.apply(this, args);
      const props = origin?.props ?? {};
      return {
        ...origin,
        props: {
          ...props,
          allowFontScaling: false,
          maxFontSizeMultiplier: 1,
        },
      };
    };
    TextAny.__FONT_SCALE_LOCKED__ = true;
  }

  if (!TextInputAny.__FONT_SCALE_LOCKED__) {
    const oldRender = TextInputAny.render;
    TextInputAny.render = function render(...args: any[]) {
      const origin = oldRender.apply(this, args);
      const props = origin?.props ?? {};
      return {
        ...origin,
        props: {
          ...props,
          allowFontScaling: false,
          maxFontSizeMultiplier: 1,
        },
      };
    };
    TextInputAny.__FONT_SCALE_LOCKED__ = true;
  }
}
