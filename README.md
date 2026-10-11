# OtherSide

Aplicativo Android local-first para preservar o conteúdo disponível nas notificações do WhatsApp, com armazenamento privado no aparelho.

## Estado atual

- Base Expo Router em TypeScript criada.
- Primeira interface implementada com histórico vazio, status da captura e aba de ajustes.
- Integração nativa Android ainda será implementada em Kotlin.

## Identidade

- Nome: OtherSide
- Pacote Android: `br.com.otherside`
- Esquema: `otherside`

## Limites do produto

O aplicativo não lê o banco privado do WhatsApp e não recupera mensagens antigas. Ele poderá preservar somente o conteúdo que aparecer em uma notificação depois que a pessoa conceder acesso ao serviço de notificações do Android.

## Desenvolvimento

```bash
npm install
npm run web
```

A captura real exigirá um build Android customizado com prebuild ou EAS. O Expo Go não incorpora o `NotificationListenerService` próprio do aplicativo.
