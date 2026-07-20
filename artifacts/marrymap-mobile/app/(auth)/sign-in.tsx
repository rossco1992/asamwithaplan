import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useSignIn, useSSO } from '@clerk/expo';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [ssoLoading, setSsoLoading] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    WebBrowser.warmUpAsync();
    return () => { WebBrowser.coolDownAsync(); };
  }, []);

  const isLoading = fetchStatus === 'fetching';

  const handleSignIn = async () => {
    if (!email || !password || isLoading) return;
    Haptics.selectionAsync();
    const { error } = await signIn.password({ emailAddress: email, password });
    if (error) return;
    if (signIn.status === 'complete') {
      await signIn.finalize({
        navigate: ({ decorateUrl }) => {
          router.replace('/');
        },
      });
    }
  };

  const handleGoogleSignIn = useCallback(async () => {
    if (ssoLoading) return;
    setSsoLoading(true);
    Haptics.selectionAsync();
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId && setActive) {
        await setActive({
          session: createdSessionId,
          navigate: async () => { router.replace('/'); },
        });
      }
    } catch (err) {
      console.error(JSON.stringify(err));
    } finally {
      setSsoLoading(false);
    }
  }, [startSSOFlow, router, ssoLoading]);

  const handleVerify = async () => {
    if (!code || isLoading) return;
    await signIn.mfa.verifyEmailCode({ code });
    if (signIn.status === 'complete') {
      await signIn.finalize({ navigate: ({ decorateUrl }) => { router.replace('/'); } });
    }
  };

  const s = useMemo(() => makeStyles(colors, insets), [colors, insets]);

  // MFA verification step
  if (signIn.status === 'needs_client_trust') {
    return (
      <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.logo}>A Sam with a plan.</Text>
        <Text style={s.heading}>Check your email</Text>
        <Text style={s.subheading}>Enter the verification code we sent to {email}</Text>
        <TextInput
          style={s.input}
          value={code}
          onChangeText={setCode}
          placeholder="6-digit code"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="number-pad"
          autoFocus
        />
        {errors.fields.code && <Text style={s.error}>{errors.fields.code.message}</Text>}
        <Pressable
          style={({ pressed }) => [s.primaryButton, (isLoading || !code) && s.buttonDisabled, pressed && s.buttonPressed]}
          onPress={handleVerify}
          disabled={isLoading || !code}
        >
          {isLoading
            ? <ActivityIndicator color={colors.primaryForeground} />
            : <Text style={s.primaryButtonText}>Verify</Text>
          }
        </Pressable>
        <Pressable onPress={() => signIn.mfa.sendEmailCode()} style={s.textAction}>
          <Text style={s.linkText}>Resend code</Text>
        </Pressable>
        <Pressable onPress={() => signIn.reset()} style={s.textAction}>
          <Text style={s.linkText}>Start over</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.logo}>A Sam with a plan.</Text>
      <Text style={s.heading}>Welcome back</Text>
      <Text style={s.subheading}>Sign in to continue your wedding plan</Text>

      {/* Google */}
      <Pressable
        style={({ pressed }) => [s.googleButton, ssoLoading && s.buttonDisabled, pressed && s.buttonPressed]}
        onPress={handleGoogleSignIn}
        disabled={ssoLoading}
        testID="google-signin-btn"
      >
        {ssoLoading
          ? <ActivityIndicator color={colors.primary} size="small" />
          : (
            <View style={s.googleRow}>
              <Ionicons name="logo-google" size={17} color={colors.primary} />
              <Text style={s.googleButtonText}>Continue with Google</Text>
            </View>
          )
        }
      </Pressable>

      <View style={s.divider}>
        <View style={s.dividerLine} />
        <Text style={s.dividerText}>or</Text>
        <View style={s.dividerLine} />
      </View>

      <Text style={s.label}>Email</Text>
      <TextInput
        style={s.input}
        value={email}
        onChangeText={setEmail}
        placeholder="your@email.com"
        placeholderTextColor={colors.mutedForeground}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        testID="email-input"
      />
      {errors.fields.identifier && <Text style={s.error}>{errors.fields.identifier.message}</Text>}

      <Text style={s.label}>Password</Text>
      <View style={s.inputRow}>
        <TextInput
          style={[s.input, s.inputFlex]}
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry={!showPassword}
          autoComplete="current-password"
          testID="password-input"
        />
        <Pressable onPress={() => setShowPassword(v => !v)} style={s.eyeBtn}>
          <Ionicons
            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={colors.mutedForeground}
          />
        </Pressable>
      </View>
      {errors.fields.password && <Text style={s.error}>{errors.fields.password.message}</Text>}

      <Pressable
        style={({ pressed }) => [s.primaryButton, (isLoading || !email || !password) && s.buttonDisabled, pressed && s.buttonPressed]}
        onPress={handleSignIn}
        disabled={isLoading || !email || !password}
        testID="signin-btn"
      >
        {isLoading
          ? <ActivityIndicator color={colors.primaryForeground} />
          : <Text style={s.primaryButtonText}>Sign in</Text>
        }
      </Pressable>

      <View style={s.footer}>
        <Text style={s.footerText}>Don't have an account?</Text>
        <Link href="/(auth)/sign-up" asChild>
          <Pressable><Text style={s.footerLink}> Sign up</Text></Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) {
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingTop: topPad + 32,
      paddingBottom: bottomPad + 40,
      paddingHorizontal: 28,
    },
    logo: {
      fontFamily: fonts.serifItalic,
      fontSize: 15,
      color: colors.accent,
      letterSpacing: 0.3,
      marginBottom: 36,
    },
    heading: {
      fontFamily: fonts.serifBold,
      fontSize: 32,
      color: colors.primary,
      marginBottom: 8,
      letterSpacing: -0.5,
    },
    subheading: {
      fontFamily: fonts.sans,
      fontSize: 15,
      color: colors.mutedForeground,
      marginBottom: 32,
      lineHeight: 22,
    },
    googleButton: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 10,
      paddingVertical: 14,
      paddingHorizontal: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      marginBottom: 20,
      minHeight: 52,
    },
    googleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    googleButtonText: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      color: colors.primary,
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 24,
      gap: 12,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: {
      fontFamily: fonts.sans,
      fontSize: 13,
      color: colors.mutedForeground,
    },
    label: {
      fontFamily: fonts.sansSemiBold,
      fontSize: 13,
      color: colors.primary,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 13,
      fontSize: 15,
      fontFamily: fonts.sans,
      color: colors.foreground,
      backgroundColor: colors.card,
      marginBottom: 16,
    },
    inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    inputFlex: { flex: 1, marginBottom: 0 },
    eyeBtn: {
      position: 'absolute',
      right: 14,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      marginBottom: 24,
      minHeight: 52,
    },
    primaryButtonText: {
      fontFamily: fonts.sansSemiBold,
      fontSize: 15,
      color: colors.primaryForeground,
    },
    buttonDisabled: { opacity: 0.45 },
    buttonPressed: { opacity: 0.8 },
    error: {
      fontFamily: fonts.sans,
      fontSize: 13,
      color: colors.destructive,
      marginTop: -10,
      marginBottom: 12,
    },
    footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    footerText: { fontFamily: fonts.sans, fontSize: 14, color: colors.mutedForeground },
    footerLink: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.accent },
    textAction: { alignSelf: 'center', paddingVertical: 8, marginBottom: 4 },
    linkText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.accent },
  });
}
