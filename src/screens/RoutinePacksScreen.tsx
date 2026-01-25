import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  TextInput,
  RefreshControl,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { supabase } from '../api/supabaseClient';
import { ensureRoomForRoutine } from '../api/sharedRoutines';
import type { ConnectStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<ConnectStackParamList>;

type Pack = {
  id: string;
  title: string;
  creator_name: string;
  description: string | null;
  created_at?: string;
};

type PackItem = {
  id: string;
  pack_id: string;
  title: string;
  group_key: string | null;
  sort_order: number;
};

type InsertedRoutine = {
  id: string;
  title: string;
};

const BG = '#0B0F14';
const CARD = '#121A23';
const LINE = '#1E2A38';
const MUTED = '#8FA3B8';
const TEXT = '#EAF2FF';
const BLUE = '#4CC9FF';

function Card({
  title,
  desc,
  right,
  children,
}: {
  title: string;
  desc?: string | null;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: CARD,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: LINE,
        padding: 14,
        marginTop: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: TEXT, fontSize: 15, fontWeight: '900' }}>{title}</Text>
          {desc ? (
            <Text style={{ color: MUTED, marginTop: 6, lineHeight: 20 }}>{desc}</Text>
          ) : null}
        </View>
        {right}
      </View>
      {children ? <View style={{ marginTop: 12 }}>{children}</View> : null}
    </View>
  );
}

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: active ? 'rgba(76,201,255,0.14)' : '#0F151D',
        borderWidth: 1,
        borderColor: active ? 'rgba(76,201,255,0.28)' : LINE,
      }}
    >
      <Text style={{ color: active ? BLUE : MUTED, fontWeight: '900', fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function RoutinePacksScreen() {
  const navigation = useNavigation<Nav>();

  const [packs, setPacks] = useState<Pack[]>([]);
  const [items, setItems] = useState<PackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [applying, setApplying] = useState<string | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  // ✅ 적용 후: 바로 공유 기록 선택 모달
  const [postApplyOpen, setPostApplyOpen] = useState(false);
  const [insertedRoutines, setInsertedRoutines] = useState<InsertedRoutine[]>([]);
  const [creatingRoom, setCreatingRoom] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);

      const { data: p, error: pErr } = await supabase
        .from('routine_packs')
        .select('id,title,creator_name,description,created_at')
        .order('created_at', { ascending: false });

      if (pErr) throw pErr;

      const { data: it, error: iErr } = await supabase
        .from('routine_pack_items')
        .select('id,pack_id,title,group_key,sort_order')
        .order('sort_order', { ascending: true });

      if (iErr) throw iErr;

      setPacks(((p as any) || []) as Pack[]);
      setItems(((it as any) || []) as PackItem[]);
    } catch (e: any) {
      Alert.alert('불러오기 실패', e?.message ?? '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const itemsByPack = useMemo(() => {
    const map = new Map<string, PackItem[]>();
    for (const it of items) {
      if (!map.has(it.pack_id)) map.set(it.pack_id, []);
      map.get(it.pack_id)!.push(it);
    }
    return map;
  }, [items]);

  const filteredPacks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return packs;

    return packs.filter((p) => {
      const list = itemsByPack.get(p.id) ?? [];
      const inPack =
        p.title.toLowerCase().includes(q) ||
        (p.creator_name ?? '').toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q);

      const inItems = list.some((it) => it.title.toLowerCase().includes(q));
      return inPack || inItems;
    });
  }, [packs, query, itemsByPack]);

  const toggleExpanded = (packId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(packId)) next.delete(packId);
      else next.add(packId);
      return next;
    });
  };

  // ✅ 핵심: 팩 적용 후 “추가된 기록 목록”을 받아서 모달 열기
  const applyPack = async (packId: string) => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) {
      Alert.alert('로그인이 필요합니다', '로그인 후 이용해 주세요.');
      return;
    }

    const list = itemsByPack.get(packId) ?? [];
    if (list.length === 0) {
      Alert.alert('비어 있습니다', '이 기록 팩에는 아이템이 없습니다.');
      return;
    }

    setApplying(packId);

    try {
      // 1) 기존 기록 제목 (중복 스킵 옵션용)
      let existingTitleSet = new Set<string>();
      if (skipDuplicates) {
        const { data: ex, error: exErr } = await supabase
          .from('routines')
          .select('title')
          .eq('user_id', user.id);

        if (exErr) throw exErr;
        existingTitleSet = new Set(((ex as any) || []).map((r: any) => String(r.title ?? '').trim()));
      }

      // 2) 마지막 sort_order
      const { data: lastData, error: lastErr } = await supabase
        .from('routines')
        .select('sort_order')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: false })
        .limit(1);

      if (lastErr) throw lastErr;

      let nextOrder = ((lastData as any)?.[0]?.sort_order ?? 0) + 1;

      // 3) payload 생성
      const payload: any[] = [];
      let skipped = 0;

      for (const it of list) {
        const t = String(it.title ?? '').trim();
        if (skipDuplicates && existingTitleSet.has(t)) {
          skipped += 1;
          continue;
        }
        payload.push({
          user_id: user.id,
          title: t,
          group_key: it.group_key,
          is_active: true,
          sort_order: nextOrder++,
        });
      }

      if (payload.length === 0) {
        Alert.alert('적용할 항목이 없습니다', '이미 동일한 기록이 모두 존재합니다.');
        return;
      }

      // ✅ insert 후 id/title 반환 (중요)
      const { data: inserted, error: insErr } = await supabase
        .from('routines')
        .insert(payload)
        .select('id,title');

      if (insErr) throw insErr;

      const insertedList = (((inserted as any) || []) as InsertedRoutine[]).map((r) => ({
        id: r.id,
        title: r.title,
      }));

      // 안내 + 공유로 이어지는 모달 오픈
      const msg =
        skipped > 0
          ? `기록이 추가되었습니다.\n(중복 ${skipped}개는 건너뛰었습니다.)\n바로 공유 기록을 생성하시겠습니까?`
          : '기록이 추가되었습니다.\n바로 공유 기록을 생성하시겠습니까?';

      Alert.alert('적용 완료', msg, [
        { text: '나중에 하겠습니다', style: 'cancel' },
        {
          text: '바로 공유하겠습니다',
          onPress: () => {
            setInsertedRoutines(insertedList);
            setPostApplyOpen(true);
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert('적용 실패', e?.message ?? '적용 중 문제가 발생했습니다.');
    } finally {
      setApplying(null);
    }
  };

  // ✅ 선택한 기록으로 공유방 생성 후 보드로 이동
  const createSharedRoomAndGo = async (routineId: string) => {
    try {
      setCreatingRoom(routineId);
      const room = await ensureRoomForRoutine(routineId);
      setPostApplyOpen(false);

      // SharedRoutineBoardScreen에서 roomId로 로딩하도록 이동
      navigation.navigate('SharedRoutineBoard', {
        roomId: room.id,
      } as any);
    } catch (e: any) {
      Alert.alert('공유 기록 생성 실패', e?.message ?? '공유 기록 생성 중 문제가 발생했습니다.');
    } finally {
      setCreatingRoom(null);
    }
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: BG }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 18 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      >
        <Card title="기록 팩" desc="클릭 한 번으로 기록 세트를 추가하실 수 있습니다.">
          <View style={{ gap: 10 }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="팩 또는 기록을 검색해 주세요"
              placeholderTextColor="#4A5A70"
              style={{
                backgroundColor: '#0F151D',
                borderWidth: 1,
                borderColor: LINE,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: TEXT,
                fontWeight: '900',
              }}
            />

            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Pill
                label={skipDuplicates ? '중복 기록 건너뛰기: 켜짐' : '중복 기록 건너뛰기: 꺼짐'}
                active={skipDuplicates}
                onPress={() => setSkipDuplicates((v) => !v)}
              />
              <Pill label="전체 펼치기" onPress={() => setExpanded(new Set(packs.map((p) => p.id)))} />
              <Pill label="전체 접기" onPress={() => setExpanded(new Set())} />
            </View>

            <Text style={{ color: MUTED, lineHeight: 20 }}>아래로 쓸어내리면 새로고침됩니다.</Text>
          </View>
        </Card>

        {loading && packs.length === 0 ? (
          <Card title="불러오는 중입니다…" desc="잠시만 기다려 주세요." />
        ) : filteredPacks.length === 0 ? (
          <Card title="표시할 팩이 없습니다" desc="검색어를 바꾸시거나, 팩 데이터를 먼저 추가해 주세요." />
        ) : (
          filteredPacks.map((p) => {
            const list = itemsByPack.get(p.id) ?? [];
            const isOpen = expanded.has(p.id);

            return (
              <Card
                key={p.id}
                title={p.title}
                desc={`${p.creator_name} · ${list.length}개`}
                right={
                  <Pressable
                    onPress={() => toggleExpanded(p.id)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      backgroundColor: '#0F151D',
                      borderWidth: 1,
                      borderColor: LINE,
                    }}
                  >
                    <Text style={{ color: MUTED, fontWeight: '900', fontSize: 12 }}>{isOpen ? '접기' : '보기'}</Text>
                  </Pressable>
                }
              >
                {p.description ? (
                  <Text style={{ color: MUTED, marginBottom: 10, lineHeight: 20 }}>{p.description}</Text>
                ) : null}

                <View style={{ gap: 8 }}>
                  {(isOpen ? list : list.slice(0, 5)).map((it) => (
                    <View
                      key={it.id}
                      style={{
                        backgroundColor: '#0F151D',
                        borderWidth: 1,
                        borderColor: LINE,
                        borderRadius: 14,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                      }}
                    >
                      <Text style={{ color: TEXT, fontWeight: '900' }}>{it.title}</Text>
                      <Text style={{ color: MUTED, marginTop: 4, fontSize: 12 }}>{it.group_key ?? '기타'}</Text>
                    </View>
                  ))}
                  {!isOpen && list.length > 5 ? (
                    <Text style={{ color: MUTED, fontSize: 12 }}>외 {list.length - 5}개가 더 있습니다.</Text>
                  ) : null}
                </View>

                <Pressable
                  onPress={() =>
                    Alert.alert('기록 팩을 적용하시겠습니까?', '선택하신 팩의 기록이 내 기록으로 추가됩니다.', [
                      { text: '취소', style: 'cancel' },
                      { text: '적용', onPress: () => applyPack(p.id) },
                    ])
                  }
                  disabled={applying === p.id}
                  style={{
                    marginTop: 12,
                    backgroundColor: 'rgba(76,201,255,0.12)',
                    borderWidth: 1,
                    borderColor: 'rgba(76,201,255,0.25)',
                    borderRadius: 16,
                    paddingVertical: 12,
                    alignItems: 'center',
                    opacity: applying === p.id ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: BLUE, fontWeight: '900' }}>
                    {applying === p.id ? '적용 중입니다…' : '이 기록 팩을 추가하기'}
                  </Text>
                </Pressable>
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* ✅ 적용 후 공유 기록 선택 모달 */}
      <Modal visible={postApplyOpen} transparent animationType="fade" onRequestClose={() => setPostApplyOpen(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'center',
            paddingHorizontal: 16,
          }}
        >
          <View
            style={{
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: LINE,
              borderRadius: 18,
              padding: 14,
            }}
          >
            <Text style={{ color: TEXT, fontWeight: '900', fontSize: 16 }}>공유할 기록을 선택해 주세요</Text>
            <Text style={{ color: MUTED, marginTop: 8, lineHeight: 20 }}>
              선택하신 기록으로 공유방이 생성되며, 참여 코드를 메시지/카카오톡으로 공유하실 수 있습니다.
            </Text>

            <View style={{ marginTop: 12, gap: 8 }}>
              {insertedRoutines.slice(0, 12).map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => createSharedRoomAndGo(r.id)}
                  disabled={creatingRoom === r.id}
                  style={{
                    backgroundColor: '#0F151D',
                    borderWidth: 1,
                    borderColor: LINE,
                    borderRadius: 14,
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    opacity: creatingRoom === r.id ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: TEXT, fontWeight: '900' }}>
                    {creatingRoom === r.id ? '공유방을 생성하는 중입니다…' : r.title}
                  </Text>
                </Pressable>
              ))}

              {insertedRoutines.length > 12 ? (
                <Text style={{ color: MUTED, fontSize: 12 }}>표시 제한이 있습니다. 대시보드에서 다른 기록도 공유하실 수 있습니다.</Text>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable
                onPress={() => setPostApplyOpen(false)}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: 'center',
                  backgroundColor: '#0E141C',
                  borderWidth: 1,
                  borderColor: LINE,
                }}
              >
                <Text style={{ color: MUTED, fontWeight: '900' }}>나중에 하겠습니다</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
