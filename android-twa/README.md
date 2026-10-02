# AGTGestor para Android (TWA)

O app abre `https://agentegestor.com.br/dashboard` em tela cheia pelo Chrome.
Tudo o que muda no site aparece no app sem nova versão na loja.

## Gerar os arquivos

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
./gradlew.bat assembleRelease bundleRelease
```

- Teste no celular: `app/build/outputs/apk/release/app-release.apk`
- Enviar para a Play Store: `app/build/outputs/bundle/release/app-release.aab`

A cada nova versão enviada, suba `versionCode` em `app/build.gradle`.

## Chave de assinatura

`agtgestor-upload.jks` e `keystore.properties` ficam fora do git.
Guarde cópia dos dois num lugar seguro. Sem eles não sai atualização.

## Barra do navegador

Ela some quando o site entrega `/.well-known/assetlinks.json` com as digitais
da chave. Depois do primeiro envio, a Play Console mostra uma segunda digital
(Integridade do app > Assinatura do app). Adicione essa digital em
`client/public/.well-known/assetlinks.json` e publique o site de novo.

## Pagamento

Dentro do app a assinatura é vendida pelo Google Play Billing (produto
`agtgestor_premium_mensal`). O site confere a compra em `POST /api/play/verify`
com a conta de serviço do Google (`PLAY_SERVICE_ACCOUNT_FILE` no `.env` do servidor).
