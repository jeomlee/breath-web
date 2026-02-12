// src/api/pushToken.ts
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabaseClient';

export async function registerAndSavePushToken() {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return;

  const perm = await Notifications.getPermissionsAsync();
  let granted = perm.granted;

  if (!granted) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.granted;
  }
  if (!granted) return;

  const projectId =
    (Constants.expoConfig as any)?.extra?.eas?.projectId ??
    (Constants.easConfig as any)?.projectId;

  const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenRes.data;

  // ✅ profiles에 저장 (단일 유저 원천)
  const { error } = await supabase
    .from('profiles')
    .update({
      expo_push_token: token,
      push_token_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_opened_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);

  // 앱 구동엔 영향 없게: 실패해도 throw는 안 함
  if (error) {
    console.log('[push token save error]', error);
  }
}
