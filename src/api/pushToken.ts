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

  await supabase
    .from('user_profiles')
    .update({
      expo_push_token: token,
      push_token_updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);
}
