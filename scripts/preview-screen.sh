#!/bin/bash
# Preview a TV host game screen with mock data.
# Usage: ./scripts/preview-screen.sh <PHASE> [web|android]
#
# Examples:
#   ./scripts/preview-screen.sh QUESTION
#   ./scripts/preview-screen.sh RESULTS android
#   ./scripts/preview-screen.sh GAME_OVER web

set -euo pipefail

VALID_PHASES="LOBBY|COUNTDOWN|MEDIA_PREVIEW|QUESTION|REVEALING|RESULTS|GAME_OVER"
PHASE="${1:-}"
PLATFORM="${2:-web}"

if [[ -z "$PHASE" ]] || ! echo "$PHASE" | grep -qE "^($VALID_PHASES)$"; then
  echo "Usage: $0 <PHASE> [web|android]"
  echo ""
  echo "Phases: $VALID_PHASES"
  echo "Platform: web (default) | android"
  exit 1
fi

case "$PLATFORM" in
  web)
    URL="http://localhost:8082/?preview=$PHASE"
    echo "Opening $URL"
    open "$URL"
    ;;
  android)
    URI="unfairenough-tv://preview?phase=$PHASE"
    echo "Sending ADB intent: $URI"
    adb shell am start -a android.intent.action.VIEW -d "$URI" com.unfairenough.tvhost
    ;;
  *)
    echo "Unknown platform: $PLATFORM (use 'web' or 'android')"
    exit 1
    ;;
esac
