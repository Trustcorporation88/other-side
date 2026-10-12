#!/usr/bin/env bash
set -euo pipefail
APK=${1:?Informe o caminho do APK}
PACKAGE=br.com.otherside
OUTPUT=${2:-smoke-output}
mkdir -p "$OUTPUT"
adb wait-for-device
adb install -r "$APK"
adb logcat -c
# Nenhum Metro roda neste job; rede desativada para provar o uso do bundle local.
adb shell svc wifi disable
adb shell svc data disable
adb shell am force-stop "$PACKAGE"
adb shell am start -W -n "$PACKAGE/.MainActivity"
for attempt in $(seq 1 30); do
  sleep 2
  adb shell uiautomator dump /sdcard/otherside-window.xml >/dev/null 2>&1 || continue
  adb pull /sdcard/otherside-window.xml "$OUTPUT/window.xml" >/dev/null 2>&1 || continue
  if grep -q 'Mensagens preservadas' "$OUTPUT/window.xml"; then
    adb shell am force-stop "$PACKAGE"
    adb shell am start -W -n "$PACKAGE/.MainActivity"
    sleep 5
    adb shell uiautomator dump /sdcard/otherside-window.xml >/dev/null
    adb pull /sdcard/otherside-window.xml "$OUTPUT/window-relaunch.xml" >/dev/null
    grep -q 'Mensagens preservadas' "$OUTPUT/window-relaunch.xml"
    adb exec-out screencap -p > "$OUTPUT/screen.png"
    adb logcat -d > "$OUTPUT/logcat.txt"
    printf '%s\n' 'ANDROID_SMOKE_OK: tela inicial abriu e reabriu sem Metro ou rede.'
    exit 0
  fi
  printf 'Aguardando interface, tentativa %s/30\n' "$attempt"
done
adb exec-out screencap -p > "$OUTPUT/screen.png"
adb logcat -d > "$OUTPUT/logcat.txt"
printf '%s\n' 'ANDROID_SMOKE_FAILED: interface não abriu.' >&2
exit 1
