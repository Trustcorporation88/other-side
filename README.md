# OtherSide

Aplicativo Android local-first para preservar o conteúdo disponível nas notificações do WhatsApp, com armazenamento privado no aparelho.

## Estado atual

Base Expo Router em TypeScript criada. A captura nativa de notificações ainda será implementada em um módulo Kotlin próprio.

## Identidade

- Nome: OtherSide
- Pacote Android: `br.com.otherside`
- Esquema: `otherside`

## Limites do produto

O aplicativo não lê o banco privado do WhatsApp e não recupera mensagens antigas. Ele poderá preservar somente o conteúdo que aparecer em uma notificação depois que a pessoa conceder acesso ao serviço de notificações do Android.
