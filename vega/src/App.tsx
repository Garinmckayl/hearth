import * as React from 'react';
import {useEffect, useRef, useState} from 'react';
import {AppState, BackHandler, StyleSheet, View, Text, Pressable} from 'react-native';
import {WebView} from '@amazon-devices/webview';
import {
  useHideSplashScreenCallback,
  usePreventHideSplashScreen,
  useTVEventHandler,
} from '@amazon-devices/react-native-kepler';
import {HEARTH_URL} from './config';

export const App = () => {
  const webRef = useRef<React.ElementRef<typeof WebView>>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  usePreventHideSplashScreen();
  const hideSplashScreen = useHideSplashScreenCallback();

  useTVEventHandler(event => {
    if (failed || event.eventKeyAction === 1) return;
    const keys: Record<string, string> = {
      up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
      select: 'Enter', enter: 'Enter', kpenter: 'Enter', esc: 'Back',
    };
    const key = keys[event.eventType];
    if (key) webRef.current?.injectJavaScript(`window.hearthRemote?.(${JSON.stringify(key)}); true;`);
  });

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (failed) return false;
      webRef.current?.injectJavaScript('window.hearthRemote?.("Back"); true;');
      return true;
    });
    return () => subscription.remove();
  }, [failed]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        webRef.current?.injectJavaScript('window.hearthPause?.(); true;');
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.container} focusable={!failed} hasTVPreferredFocus={!failed}>
      {failed ? (
        <View style={styles.error}>
          <Text style={styles.heading}>Pip’s home is temporarily out of reach.</Text>
          <Text style={styles.message}>Check your connection, then try again.</Text>
          <Pressable
            hasTVPreferredFocus
            accessibilityRole="button"
            onPress={() => {
              setFailed(false);
              setAttempt(value => value + 1);
            }}
            style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <WebView
          key={attempt}
          ref={webRef}
          style={styles.container}
          allowSystemKeyEvents={false}
          domStorageEnabled
          focusable={false}
          javaScriptEnabled
          mediaPlaybackRequiresUserAction={false}
          mixedContentMode="never"
          source={{uri: HEARTH_URL}}
          injectedJavaScriptBeforeContentLoaded="window.HearthNative = {backendUrl: () => '', exit: () => {window.hearthPause?.(); window.ReactNativeWebView.postMessage('hearth:exit');}}; true;"
          onMessage={({nativeEvent}) => {
            if (nativeEvent.data === 'hearth:exit') BackHandler.exitApp();
          }}
          onLoad={() => hideSplashScreen()}
          onError={() => {
            setFailed(true);
            hideSplashScreen();
          }}
          onHttpError={({nativeEvent}) => {
            if (nativeEvent.isMainFrame && nativeEvent.statusCode >= 400) {
              setFailed(true);
              hideSplashScreen();
            }
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#28241c'},
  error: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 64},
  heading: {color: '#fff0d5', fontSize: 36, marginBottom: 24},
  message: {color: '#e8c991', fontSize: 26, marginBottom: 32},
  retry: {backgroundColor: '#e8c991', borderRadius: 12, padding: 24},
  retryText: {color: '#28241c', fontSize: 28},
});
