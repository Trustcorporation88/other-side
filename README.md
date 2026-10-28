# OtherSide

Aplicativo Android local-first para preservar o conteúdo disponível nas notificações do WhatsApp, com armazenamento privado no aparelho.

## Estado atual

- Base Expo Router em TypeScript criada.
- Primeira interface implementada com histórico vazio, status da captura e aba de ajustes.
- Módulo Kotlin conectado ao histórico local e ao acesso às notificações.
- Preservação de notas de voz e **fotos** do WhatsApp por observação da pasta de mídia, com abas de reprodução (Áudios) e galeria (Fotos).
- **Backup opcional no Google Drive** da própria pessoa (login com escopo `drive.file`); sobe áudios, fotos e o texto das mensagens para a pasta `OtherSide/`, organizados em **subpastas por mês** (`OtherSide/AAAA-MM/`) com a data original carimbada em cada arquivo, e continua **em segundo plano** (melhor-esforço). Um arquivo com o mesmo nome e o mesmo tamanho não é enviado de novo. Cópias que já existem no Drive não são apagadas pelo app.
- **Backup da galeria**: fotos e vídeos de `DCIM/Camera` vão para `OtherSide/AAAA-MM/Fotos`. Dá para incluir também as imagens do WhatsApp que aparecem na galeria. Fotos novas sobem sozinhas; em Ajustes há o envio inicial das que já estão no aparelho. Por padrão a galeria espera Wi-Fi, e dá para exigir carregador.
- **Backup completo do histórico**: além dos itens recentes preservados, o app envia ao Drive TODA a mídia que está no celular (áudios, fotos e **documentos/PDF**, sem vídeo do WhatsApp), subindo direto da pasta do WhatsApp. Vídeos da câmera entram só pelo backup da galeria. Os **10 documentos mais recentes** também ficam no aparelho, na aba **Docs**, para abrir mesmo depois de apagados na conversa. O restante continua só no Drive.
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

## Gerar e instalar o APK

O APK de uso no aparelho é o **release**: ele leva o JavaScript dentro do pacote e abre sem o Metro. É preciso Node.js 22, JDK 17 e o Android SDK. Na primeira vez o `prebuild` cria a pasta `android/` (ela não vai para o git).

```bash
npm ci
npx expo prebuild --platform android --no-install
cd android
./gradlew :app:assembleRelease
```

O arquivo fica em `android/app/build/outputs/apk/release/app-release.apk`. Para instalar por cima da versão anterior, com o aparelho em depuração USB:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

A assinatura é a chave de teste que o Expo gera no prebuild. Serve para uso privado neste aparelho. Não é assinatura de loja e não deve ir para o Google Play. Se o `adb install` recusar o pacote, desinstale a versão antiga assinada com outra chave e instale de novo (isso apaga o histórico local do app).

Depois de instalar: abra **Ajustes**, conecte o Google Drive e conceda **fotos e vídeos**. O backup da câmera começa no Wi-Fi. **Enviar fotos existentes agora** manda o que já está em `DCIM/Camera`. Fotos novas seguem sozinhas, em segundo plano, enquanto o Android deixar a tarefa rodar (o sistema pode atrasar; não é um horário fixo).

## Permissões Android

| Permissão | Para quê |
| --- | --- |
| Acesso às notificações | Texto das mensagens do WhatsApp |
| `MANAGE_EXTERNAL_STORAGE` (acesso a todos os arquivos) | Copiar notas de voz e mídia da pasta protegida do WhatsApp. Android 11+ |
| `READ_MEDIA_AUDIO` | Áudio do WhatsApp no Android 13+ |
| `READ_MEDIA_IMAGES` e `READ_MEDIA_VIDEO` | Galeria (`DCIM/Camera` e, se ligado, imagens do WhatsApp) via MediaStore. Android 13+ |
| `READ_MEDIA_VISUAL_USER_SELECTED` | Android 14, quando a pessoa libera só algumas fotos. O app envia só essas |
| `READ_EXTERNAL_STORAGE` | Leitura de mídia no Android 12 e anteriores |
| `ACCESS_NETWORK_STATE` | Saber se a rede é Wi-Fi antes de subir a galeria |

Áudios, documentos e `mensagens.json` não esperam Wi-Fi. Essa trava vale só para a galeria.

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
node --experimental-strip-types --test scripts/test_upload_identity.ts
python3 scripts/verify_standalone_apk.py /caminho/app-release.apk
```
