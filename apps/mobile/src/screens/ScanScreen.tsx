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
import { useCallback, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

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

interface ScanScreenProps {
  onConnect: (url: string) => void;
  onLanguageChange: (lang: SupportedLanguage) => void;
}

export const ScanScreen: React.FC<ScanScreenProps> = ({ onConnect, onLanguageChange }) => {
  const { t, i18n } = useTranslation();

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

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    // Expect ws://IP:PORT format
    if (data.startsWith('ws://')) {
      onConnect(data);
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
    setShowIpInput(true);
  };

  const handleIpConnect = () => {
    const ip = manualIp.trim() || 'localhost';
    const url = `ws://${ip}:8080`;
    onConnect(url);
  };

  // Web version - no camera
  if (Platform.OS === 'web') {
    return (
      <ScreenBackground style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t('lobby.title')}</Text>
          <View style={styles.languageSwitcher}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                onPress={() => handleLanguageChange(lang.code)}
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
        </View>
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
          )}
        </Card>
      </ScreenBackground>
    );
  }

  // Native version with camera
  if (!permission) {
    return (
      <ScreenBackground style={styles.container}>
        <Text style={styles.loadingText}>{t('scan.loadingCamera')}</Text>
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
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('lobby.title')}</Text>
        <View style={styles.languageSwitcher}>
          {LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang.code}
              onPress={() => handleLanguageChange(lang.code)}
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
      </View>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  languageSwitcher: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    gap: spacing.xs,
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
    marginBottom: spacing.lg,
  },
  connectButton: {
    minWidth: 150,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
});
