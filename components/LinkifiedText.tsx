import { useMemo } from 'react';
import { Alert, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import * as Linking from 'expo-linking';

import { splitMessageLinks } from '@/lib/messageLinks';

type Props = {
  text: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
};

async function openLink(href: string) {
  try {
    await Linking.openURL(href);
  } catch {
    Alert.alert('Não foi possível abrir o link', href);
  }
}

// Links are nested Text with their own onPress, so a tap on a link is consumed
// by the link and never reaches a surrounding Pressable (e.g. a media card).
export function LinkifiedText({ text, style, linkStyle }: Props) {
  const segments = useMemo(() => splitMessageLinks(text), [text]);

  return (
    <Text style={style}>
      {segments.map((segment, index) =>
        segment.type === 'link' ? (
          <Text
            key={index}
            accessibilityRole="link"
            onPress={() => openLink(segment.href)}
            style={[styles.link, linkStyle]}>
            {segment.text}
          </Text>
        ) : (
          segment.text
        )
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: {
    color: '#7FB2FF',
    textDecorationLine: 'underline',
  },
});
