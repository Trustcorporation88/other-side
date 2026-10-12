import { Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

const colors = {
  navy: '#071527',
  surface: '#102944',
  blue: '#4F8CFF',
  muted: '#8FA5BC',
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => <Text />,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mensagens',
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>▤</Text>,
        }}
      />
      <Tabs.Screen
        name="audios"
        options={{
          title: 'Áudios',
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>♪</Text>,
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>○</Text>,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: '#1C3E63',
    borderTopWidth: 1,
    height: 83,
    paddingBottom: 15,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  tabIcon: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
});
