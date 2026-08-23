import { type SupportedLanguage, useTranslation } from '@unfairenough/i18n';
import {
  Button,
  borderRadius,
  Card,
  colors,
  ScreenBackground,
  spacing,
  typography,
} from '@unfairenough/ui';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { addRecentServer, getRecentServers, initRecentServers } from '../services/recentServers';
import { APP_VERSION } from '../version';

// Only import camera on native platforms
let CameraView: any = null;
let useCameraPermissions: any = null;
if (Platform.OS !== 'web') {
  const camera = require('expo-camera');
  CameraView = camera.CameraView;
  useCameraPermissions = camera.useCameraPermissions;
}

const LANGUAGES: { code: SupportedLanguage; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'it', label: 'IT' },
];

function stripProtocol(value: string): string {
  return value
    .replace(/^wss?:\/\//, '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

function hasExplicitPort(host: string): boolean {
  return /:\d+$/.test(host);
}

function isLanHost(host: string): boolean {
  const hostname = host.split(':')[0];
  return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|localhost$|127\.)/.test(hostname);
}

function normalizeHost(host: string): string {
  return stripProtocol(host.trim());
}

function getWsScheme(input: string, host: string): 'ws' | 'wss' {
  if (/^wss?:\/\//.test(input)) return input.match(/^(wss?):/)?.[1] === 'wss' ? 'wss' : 'ws';
  if (/^https:\/\//.test(input)) return 'wss';
  if (/^http:\/\//.test(input)) return 'ws';
  return hasExplicitPort(host) || isLanHost(host) ? 'ws' : 'wss';
}

interface ScanScreenProps {
  onConnect: (url: string, invitationToken?: string) => void;
  onLanguageChange: (lang: SupportedLanguage) => void;
}

/** Language pills, on their own row above the title so a long title can't collide. */
function LanguageSwitcher({ onSelect }: { onSelect: (lang: SupportedLanguage) => void }) {
  const { i18n } = useTranslation();
  return (
    <View style={styles.languageRow}>
      {LANGUAGES.map((lang) => (
        <TouchableOpacity
          key={lang.code}
          onPress={() => onSelect(lang.code)}
          style={[
            styles.languageButton,
            i18n.language === lang.code && styles.languageButtonActive,
          ]}
        >
          <Text
            style={[
              styles.languageButtonText,
              i18n.language === lang.code && styles.languageButtonTextActive,
            ]}
          >
            {lang.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function RecentServersList({
  servers,
  onSelect,
}: {
  servers: string[];
  onSelect: (address: string) => void;
}) {
  const { t } = useTranslation();
  if (servers.length === 0) return null;
  return (
    <View style={styles.recentContainer}>
      <Text style={styles.recentLabel}>{t('scan.recentServers')}</Text>
      <View style={styles.recentChips}>
        {servers.map((address) => (
          <TouchableOpacity
            key={address}
            style={styles.recentChip}
            onPress={() => onSelect(address)}
          >
            <Text style={styles.recentChipText}>{address}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export const ScanScreen: React.FC<ScanScreenProps> = ({ onConnect, onLanguageChange }) => {
  const { t } = useTranslation();
  const [recentServers, setRecentServers] = useState<string[]>([]);

  const handleLanguageChange = useCallback(
    (lang: SupportedLanguage) => {
      onLanguageChange(lang);
    },
    [onLanguageChange],
  );
  const [manualCode, setManualCode] = useState('');
  const [manualIp, setManualIp] = useState('');
  const [showIpInput, setShowIpInput] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] =
    Platform.OS !== 'web' && useCameraPermissions
      ? // biome-ignore lint/correctness/useHookAtTopLevel: conditionally available on native only
        useCameraPermissions()
      : [{ granted: false }, () => {}];

  useEffect(() => {
    initRecentServers().then((servers) => {
      setRecentServers(servers);
      if (servers.length > 0) {
        setManualIp(servers[0]);
      }
    });
  }, []);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    if (data.startsWith('ws://') || data.startsWith('wss://')) {
      // Local mode: ws://IP:PORT
      try {
        const url = new URL(data);
        const address = url.port ? `${url.hostname}:${url.port}` : url.hostname;
        addRecentServer(address).then(() => setRecentServers(getRecentServers()));
      } catch {
        // URL parsing failed, still connect
      }
      onConnect(data);
    } else if (data.startsWith('http://') || data.startsWith('https://')) {
      // Hosted mode: http://metro/?roomCode=XXXX&server=host:port
      // or legacy:   http://server/mobile/?roomCode=XXXX
      try {
        const url = new URL(data);
        const roomCode = url.searchParams.get('roomCode');
        const inviteToken = url.searchParams.get('invite') || undefined;
        const serverHost = normalizeHost(url.searchParams.get('server') || url.host);
        const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        addRecentServer(serverHost).then(() => setRecentServers(getRecentServers()));
        const wsUrl = roomCode
          ? `${wsProtocol}//${serverHost}/ws?role=player&roomCode=${roomCode}`
          : `${wsProtocol}//${serverHost}/ws?role=player`;
        onConnect(wsUrl, inviteToken);
      } catch {
        if (Platform.OS === 'web') {
          alert(t('scan.invalidQrMessage'));
        } else {
          const { Alert } = require('react-native');
          Alert.alert(t('scan.invalidQrCode'), t('scan.invalidQrMessage'));
        }
        setTimeout(() => setScanned(false), 2000);
      }
    } else {
      if (Platform.OS === 'web') {
        alert(t('scan.invalidQrMessage'));
      } else {
        const { Alert } = require('react-native');
        Alert.alert(t('scan.invalidQrCode'), t('scan.invalidQrMessage'));
      }
      setTimeout(() => setScanned(false), 2000);
    }
  };

  const handleManualConnect = () => {
    const code = manualCode.toUpperCase().trim();
    if (code.length !== 4) {
      if (Platform.OS === 'web') {
        alert(t('scan.invalidCodeMessage'));
      } else {
        const { Alert } = require('react-native');
        Alert.alert(t('scan.invalidCode'), t('scan.invalidCodeMessage'));
      }
      return;
    }
    // The web client is served by the game server itself, so connect via this
    // origin — no need to ask for an address the page already knows.
    if (Platform.OS === 'web') {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      onConnect(`${proto}://${window.location.host}/ws?role=player&roomCode=${code}`);
      return;
    }
    setShowIpInput(true);
  };

  const handleIpConnect = () => {
    const input = manualIp.trim();
    if (!input) {
      if (Platform.OS === 'web') {
        alert(t('scan.missingServerMessage'));
      } else {
        const { Alert } = require('react-native');
        Alert.alert(t('scan.missingServer'), t('scan.missingServerMessage'));
      }
      return;
    }
    const code = manualCode.toUpperCase().trim();
    const host = normalizeHost(input);
    const scheme = getWsScheme(input, host);
    addRecentServer(host).then(() => setRecentServers(getRecentServers()));
    onConnect(`${scheme}://${host}/ws?role=player&roomCode=${code}`);
  };

  const handleSelectRecent = (address: string) => {
    setManualIp(address);
  };

  const versionTag = <Text style={styles.version}>v{APP_VERSION}</Text>;

  const ipInputSection = (
    <>
      <Text style={styles.manualLabel}>{t('scan.enterTvIp')}</Text>
      <TextInput
        style={styles.ipInput}
        value={manualIp}
        onChangeText={setManualIp}
        placeholder={t('scan.ipPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        autoFocus
      />
      <RecentServersList servers={recentServers} onSelect={handleSelectRecent} />
      <View style={styles.buttonRow}>
        <Button
          title={t('common.back')}
          onPress={() => setShowIpInput(false)}
          variant="outline"
          size="small"
        />
        <Button
          title={t('common.connect')}
          onPress={handleIpConnect}
          style={styles.connectButton}
        />
      </View>
    </>
  );

  // Web version - no camera
  if (Platform.OS === 'web') {
    return (
      <ScreenBackground style={styles.container}>
        <LanguageSwitcher onSelect={handleLanguageChange} />
        <Text style={styles.title}>{t('lobby.title')}</Text>
        <Text style={styles.subtitle}>{t('scan.joinGameOnTv')}</Text>

        <Card style={styles.manualCardLarge}>
          {!showIpInput ? (
            <>
              <Text style={styles.manualLabel}>{t('scan.enterRoomCode')}</Text>
              <TextInput
                style={styles.codeInputLarge}
                value={manualCode}
                onChangeText={(text) => setManualCode(text.toUpperCase())}
                placeholder={t('join.codePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                maxLength={4}
              />
              <Button
                title={t('common.next')}
                onPress={handleManualConnect}
                disabled={manualCode.length !== 4}
                style={styles.connectButton}
              />
            </>
          ) : (
            ipInputSection
          )}
        </Card>
        {versionTag}
      </ScreenBackground>
    );
  }

  // Native version with camera
  if (!permission) {
    return (
      <ScreenBackground style={styles.container}>
        <Text style={styles.loadingText}>{t('scan.loadingCamera')}</Text>
        {versionTag}
      </ScreenBackground>
    );
  }

  if (!permission.granted) {
    return (
      <ScreenBackground style={styles.container}>
        <Card style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>{t('scan.cameraPermission')}</Text>
          <Text style={styles.permissionText}>{t('scan.cameraPermissionMessage')}</Text>
          <Button
            title={t('scan.grantPermission')}
            onPress={requestPermission}
            style={styles.permissionButton}
          />
        </Card>
        {versionTag}
      </ScreenBackground>
    );
  }

  // Native IP input step (after entering room code)
  if (showIpInput) {
    return (
      <ScreenBackground style={styles.container}>
        <Text style={styles.title}>{t('lobby.title')}</Text>
        <Card style={styles.manualCardLarge}>{ipInputSection}</Card>
        {versionTag}
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground style={styles.container}>
      <LanguageSwitcher onSelect={handleLanguageChange} />
      <Text style={styles.title}>{t('lobby.title')}</Text>
      <Text style={styles.subtitle}>{t('scan.scanQrOnTv')}</Text>

      <View style={styles.cameraContainer}>
        {CameraView && (
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          />
        )}
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
        </View>
      </View>

      <Card style={styles.manualCard}>
        <Text style={styles.manualLabel}>{t('scan.orEnterRoomCode')}</Text>
        <View style={styles.manualInput}>
          <TextInput
            style={styles.codeInput}
            value={manualCode}
            onChangeText={(text) => setManualCode(text.toUpperCase())}
            placeholder={t('join.codePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            maxLength={4}
          />
          <Button
            title={t('join.join')}
            onPress={handleManualConnect}
            disabled={manualCode.length !== 4}
            size="small"
          />
        </View>
      </Card>
      {versionTag}
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  languageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  languageButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.textSecondary,
  },
  languageButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  languageButtonText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  languageButtonTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    textAlign: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  permissionCard: {
    padding: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  permissionTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  permissionText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  permissionButton: {
    minWidth: 200,
  },
  cameraContainer: {
    flex: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: colors.primary,
    borderRadius: borderRadius.lg,
    backgroundColor: 'transparent',
  },
  manualCard: {
    padding: spacing.md,
  },
  manualCardLarge: {
    padding: spacing.xl,
    marginTop: spacing.xl,
  },
  manualLabel: {
    ...typography.h3,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  manualInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  codeInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 8,
  },
  codeInputLarge: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    ...typography.displayMedium,
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 12,
    marginBottom: spacing.lg,
  },
  ipInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  connectButton: {
    minWidth: 150,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
  recentContainer: {
    marginBottom: spacing.md,
  },
  recentLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  recentChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  recentChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  // marginTop: 'auto' pins it to the bottom on the screens whose content
  // doesn't fill the height (loading, permission, room-code entry).
  version: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 'auto',
    paddingTop: spacing.sm,
    opacity: 0.6,
  },
  recentChipText: {
    ...typography.bodySmall,
    color: colors.primary,
  },
});
