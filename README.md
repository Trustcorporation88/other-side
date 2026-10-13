# OtherSide

Aplicativo Android local-first para preservar o conteúdo disponível nas notificações do WhatsApp, com armazenamento privado no aparelho.

## Estado atual

- Base Expo Router em TypeScript criada.
- Primeira interface implementada com histórico vazio, status da captura e aba de ajustes.
- Módulo Kotlin conectado ao histórico local e ao acesso às notificações.
- Preservação de notas de voz e **fotos** do WhatsApp por observação da pasta de mídia, com abas de reprodução (Áudios) e galeria (Fotos).
- **Backup opcional no Google Drive** da própria pessoa (login com escopo `drive.file`); sobe áudios, fotos e o texto das mensagens para a pasta `OtherSide/`.
- **Economia de memória**: itens já enviados ao Drive e com mais de 7 dias têm a cópia local apagada (fica só índice + miniatura); ao abrir um item antigo, o app baixa do Drive sob demanda, sempre dentro do próprio app.
- Validação em aparelho físico ainda necessária.

## Identidade

- Nome: OtherSide
- Pacote Android: `br.com.otherside`
- Esquema: `otherside`

## Limites do produto

O aplicativo não lê o banco privado do WhatsApp e não recupera mensagens antigas. O texto das mensagens é preservado somente a partir das notificações que chegarem depois de a pessoa conceder acesso ao serviço de notificações do Android. As notas de voz são preservadas a partir da pasta de mídia do WhatsApp, quando a pessoa concede a permissão de acesso a todos os arquivos (ver "Preservação de áudio").

## Desenvolvimento

```bash
npm install
npm run web
```

A captura real exigirá um build Android customizado com prebuild ou EAS. O Expo Go não incorpora o `NotificationListenerService` próprio do aplicativo.

## APK autônomo de teste

O APK `assembleDebug` não inclui o JavaScript do aplicativo por padrão e depende de Metro. As entregas debug anteriores não continham `assets/index.android.bundle`, causando a permanência no splash ao abrir fora do ambiente de desenvolvimento. As alterações de fonte e splash não tratavam a causa do empacotamento.

O CI agora usa `assembleRelease` para incorporar o JavaScript e desativar o suporte de desenvolvimento. Antes do upload, `scripts/verify_standalone_apk.py` verifica integridade do ZIP, bundle não vazio, bibliotecas nativas e SHA-256. Um segundo job instala o APK em emulador Android, abre e reabre o app sem Metro e sem rede, e exige a tela de mensagens.

O listener usa a chave estável da notificação do Android junto ao conteúdo para reconhecer uma reentrega sem usar o horário, que pode mudar quando uma notificação antiga reaparece. Ao carregar o histórico legado, cópias exatamente iguais na mesma conversa são consolidadas. Notificações novas com chaves Android diferentes continuam sendo eventos independentes, mesmo que o texto seja igual.

O APK 1.0.3 incluiu um diagnóstico local e transitório de anexos de áudio nas notificações. Ele verificava se o WhatsApp expôs uma URI de mídia e se o OtherSide conseguia abri-la no instante da notificação. O diagnóstico confirmou que a notificação de nota de voz do WhatsApp não carrega o arquivo de áudio (`not_provided`): a notificação traz apenas texto. Portanto, não é possível recuperar o áudio pela notificação.

## Preservação de áudio

Como a notificação não entrega o arquivo, o OtherSide preserva as notas de voz observando a pasta de mídia do WhatsApp no disco e copiando o arquivo para o armazenamento privado do app assim que ele chega — antes que o WhatsApp o apague. Nenhum áudio sai do aparelho.

- `WhatsAppAudioPreserver` observa `Android/media/com.whatsapp/.../WhatsApp Voice Notes` (e `WhatsApp Audio`, além das variantes do WhatsApp Business e dos caminhos legados) com um `FileObserver` recursivo. A cada retorno do app ao primeiro plano também é feita uma varredura de recuperação dos arquivos recentes, pois o inotify pode perder eventos em alguns aparelhos.
- A aba **Áudios** lista as cópias preservadas e reproduz cada uma com `expo-audio`.
- Requer **Android 11+** e a permissão **Acesso a todos os arquivos** (`MANAGE_EXTERNAL_STORAGE`), concedida pela própria pessoa, porque a pasta de mídia do WhatsApp é protegida. Por isso esta variante é de distribuição privada, não do Google Play.

Limites: só é possível preservar um áudio que o WhatsApp já tenha baixado para o disco. Se o remetente apagar antes do download no aparelho de quem recebe, não há arquivo a copiar. A preservação vale para o que chega depois da permissão concedida, mais uma janela de recuperação dos arquivos ainda presentes no disco.

Esta variante usa a chave de teste gerada pelo Expo. Não é uma assinatura de produção e não deve ser publicada no Google Play. A assinatura definitiva e a proteção dos dados ainda devem ser definidas antes de distribuição pública.

```bash
python3 -m unittest discover -s scripts -p 'test_*.py' -v
python3 scripts/verify_standalone_apk.py /caminho/app-release.apk
```
