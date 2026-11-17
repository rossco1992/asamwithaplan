import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import { formatDate } from '@/lib/journey';
import { inviteMessage, partnerOf, type Invite } from '@/lib/couple';
import type { CoupleActions } from '@/hooks/useCouple';

interface Props {
  visible: boolean;
  couple: CoupleActions;
  onLeft: () => void;
  onClose: () => void;
}

/**
 * The couple's shared plan: invite the other partner with a one-time code
 * they share themselves, or see who has joined. Nothing is sent for them.
 */
export function CoupleSheet({ visible, couple, onLeft, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = couple.couple;

  useEffect(() => {
    if (!visible) return;
    setError(null);
    couple.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const you = data?.members.find((member) => member.isYou) ?? null;
  const partner = data ? partnerOf(data.members) : null;

  const makeCode = async () => {
    setBusy(true);
    setError(null);
    const result = await couple.createInvite();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setInvite(result.data);
  };

  const share = async () => {
    if (!invite) return;
    await Share.share({ message: inviteMessage(invite) });
  };

  const cancelCode = async () => {
    setBusy(true);
    const result = await couple.cancelInvite();
    setBusy(false);
    if (result.ok) setInvite(null);
    else setError(result.error);
  };

  const confirmRemove = () => {
    if (!partner || !you) return;
    const leaving = you.role === 'partner';
    const name = partner.firstName ?? 'your partner';
    Alert.alert(
      leaving ? 'Leave this plan?' : `Remove ${name}?`,
      leaving
        ? "You'll lose access to this wedding plan. Your partner keeps everything."
        : `${name} will lose access to this wedding plan. You keep everything, and you can invite them again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: leaving ? 'Leave' : 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await couple.removeMember(leaving ? you.id : partner.id);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            if (leaving) {
              onClose();
              onLeft();
            }
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.toolbar}>
          <View style={styles.toolbarSide} />
          <Text style={[styles.toolbarTitle, { color: colors.primary }]} accessibilityRole="header">
            Your plan together
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10} style={styles.toolbarSide}>
            <Text style={[styles.toolbarText, { color: colors.accent }]}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {!data ? <ActivityIndicator color={colors.accent} /> : null}

          {data?.members.map((member) => (
            <View
              key={member.id}
              style={[styles.person, { backgroundColor: colors.card, borderColor: colors.border }]}
              accessible
              accessibilityLabel={`${member.firstName ?? 'Partner'}${member.isYou ? ', you' : ''}`}
            >
              <View style={[styles.avatar, { backgroundColor: member.isYou ? colors.primary : colors.accent }]}>
                <Text style={[styles.avatarText, { color: colors.primaryForeground }]}>
                  {member.firstName?.[0]?.toUpperCase() ?? '♡'}
                </Text>
              </View>
              <Text style={[styles.personName, { color: colors.primary }]}>
                {member.firstName ?? 'Partner'}
                {member.isYou ? <Text style={{ color: colors.mutedForeground }}>  (you)</Text> : null}
              </Text>
            </View>
          ))}

          {data?.canInvite ? (
            <View style={[styles.inviteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.inviteTitle, { color: colors.primary }]}>Plan this together</Text>
              <Text style={[styles.help, { color: colors.mutedForeground }]}>
                Your partner gets their own login and sees the same journey, tasks and dates.
              </Text>

              {invite ? (
                <>
                  <Text
                    selectable
                    style={[styles.code, { color: colors.primary, backgroundColor: colors.secondary }]}
                    accessibilityLabel={`Invite code ${invite.code.split('').join(' ')}`}
                  >
                    {invite.code}
                  </Text>
                  <Text style={[styles.help, { color: colors.mutedForeground }]}>
                    Works once, until {formatDate(invite.expiresAt.slice(0, 10), { month: 'long', day: 'numeric' })}.
                  </Text>
                  <Pressable
                    onPress={share}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary }, pressed && styles.pressed]}
                  >
                    <Ionicons name="share-outline" size={18} color={colors.primaryForeground} />
                    <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Share the code</Text>
                  </Pressable>
                  <Pressable onPress={cancelCode} accessibilityRole="button" disabled={busy} hitSlop={8}>
                    <Text style={[styles.link, { color: colors.mutedForeground }]}>Cancel this code</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  {data.pendingInvite ? (
                    <Text style={[styles.help, { color: colors.mutedForeground }]}>
                      A code is waiting to be used. Making a new one cancels it.
                    </Text>
                  ) : null}
                  <Pressable
                    onPress={makeCode}
                    disabled={busy}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary }, pressed && styles.pressed]}
                  >
                    {busy ? (
                      <ActivityIndicator color={colors.primaryForeground} />
                    ) : (
                      <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>
                        {data.pendingInvite ? 'Make a new code' : 'Invite your partner'}
                      </Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          ) : null}

          {partner && you ? (
            <Pressable onPress={confirmRemove} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.link, { color: colors.destructive }]}>
                {you.role === 'partner' ? 'Leave this plan' : `Remove ${partner.firstName ?? 'your partner'}`}
              </Text>
            </Pressable>
          ) : null}

          {error ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.destructive} />
              <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  toolbarSide: { minWidth: 48, alignItems: 'flex-end' },
  toolbarText: { fontFamily: fonts.sansSemiBold, fontSize: 16 },
  toolbarTitle: { fontFamily: fonts.sansSemiBold, fontSize: 16 },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.serifBold, fontSize: 18 },
  personName: { fontFamily: fonts.sansSemiBold, fontSize: 16 },
  inviteCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12, marginTop: 8 },
  inviteTitle: { fontFamily: fonts.serifBold, fontSize: 22 },
  help: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  code: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 30,
    letterSpacing: 4,
    textAlign: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    overflow: 'hidden',
  },
  primary: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryText: { fontFamily: fonts.sansSemiBold, fontSize: 16 },
  pressed: { opacity: 0.85 },
  link: { fontFamily: fonts.sansMedium, fontSize: 15, textAlign: 'center', paddingVertical: 8 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  error: { fontFamily: fonts.sans, fontSize: 14, flex: 1 },
});
