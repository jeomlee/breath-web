// src/constants/strings.ts
export const STR = {
  common: {
    ok: '확인',
    cancel: '취소',
    close: '닫기',
    loading: '불러오는 중입니다…',
    retry: '잠시 후 다시 시도해 주세요.',
  },
  auth: {
    needLogin: '로그인이 필요합니다.',
    logoutTitle: '로그아웃',
    logoutConfirm: '로그아웃하시겠습니까?',
    logoutFailed: '로그아웃에 실패했습니다.',
  },
  nickname: {
    label: '닉네임',
    placeholder: '닉네임을 입력해 주세요',
    invalidMin: '닉네임을 1자 이상 입력해 주세요.',
    invalidMax: '닉네임은 7자 이하로 입력해 주세요.',
    saved: '닉네임이 저장되었습니다.',
    saveFailed: '닉네임 저장에 실패했습니다.',
  },
  policy: {
    openFailed: 'URL을 확인해 주세요.',
    deleteTitle: '계정 삭제',
    deleteConfirm: '계정을 삭제하시겠습니까?',
  },
} as const;
