import { DarkTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';
import '@/lib/backgroundSync';

import { DriveBackupRuntime } from '@/components/DriveBackupRuntime';

const navy = '#071527';

const OtherSideTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: navy,
    card: '#102944',
    primary: '#4F8CFF',
    text: '#F4F7FB',
    border: '#1C3E63',
    notification: '#4F8CFF',
  },
};

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ backgroundColor: navy, flex: 1, justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: '#F4F7FB', fontSize: 22, fontWeight: '800', marginBottom: 10 }}>
        A tela não carregou
      </Text>
      <Text style={{ color: '#A8B8CA', fontSize: 14, lineHeight: 21, marginBottom: 22 }}>
        {error.message}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={retry}
        style={{ backgroundColor: '#4F8CFF', borderRadius: 12, minHeight: 48, justifyContent: 'center' }}>
        <Text style={{ color: '#061329', fontSize: 15, fontWeight: '800', textAlign: 'center' }}>
          Tentar de novo
        </Text>
      </Pressable>
    </View>
  );
}

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={OtherSideTheme}>
        <DriveBackupRuntime />
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: navy },
            headerStyle: { backgroundColor: navy },
            headerTintColor: '#F4F7FB',
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
