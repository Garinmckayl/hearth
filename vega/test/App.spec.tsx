import * as React from 'react';
import {act, fireEvent, render} from '@testing-library/react-native';
import {App} from '../src/App';

const mockHideSplash = jest.fn();
const mockInject = jest.fn();
const mockRemove = jest.fn();
const mockExit = jest.fn();
let mockAppStateHandler: (state: string) => void;
let mockTVHandler: (event: {eventType: string; eventKeyAction?: number}) => void;
let mockBackHandler: () => boolean;

jest.mock('@amazon-devices/kepler-media-controls', () => ({
  MediaControlComponentAsync: {makeMediaControlEndpointLocator: () => ({getMediaControlEndpoints: async () => []})},
}));

jest.mock('@amazon-devices/webview', () => {
  const ReactModule = require('react');
  return {
    WebView: ReactModule.forwardRef((props: unknown, ref: unknown) => {
      ReactModule.useImperativeHandle(ref, () => ({injectJavaScript: mockInject}));
      return ReactModule.createElement('WebView', props);
    }),
  };
});

jest.mock('@amazon-devices/react-native-kepler', () => ({
  usePreventHideSplashScreen: jest.fn(),
  useHideSplashScreenCallback: () => mockHideSplash,
  useTVEventHandler: (handler: typeof mockTVHandler) => { mockTVHandler = handler; },
  AppState: {
    addEventListener: jest.fn((_event, handler) => {
      mockAppStateHandler = handler;
      return {remove: mockRemove};
    }),
  },
  BackHandler: {
    exitApp: () => mockExit(),
    addEventListener: jest.fn((_event, handler) => {
      mockBackHandler = handler;
      return {remove: jest.fn()};
    }),
  },
  StyleSheet: {create: (styles: unknown) => styles, flatten: (styles: unknown) => styles},
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  Linking: {canOpenURL: jest.fn(async () => false), openURL: jest.fn()},
}));

beforeEach(() => jest.clearAllMocks());

test('native TV bridge rejects foreign pages and returns real discovery results to the home', async () => {
  const view = render(<App />);
  const webview = view.UNSAFE_getByType('WebView' as never);
  const message = JSON.stringify({type: 'hearth:tv', id: '1', command: {action: 'status'}});
  await act(async () => { await webview.props.onMessage({nativeEvent: {url: 'https://untrusted.example/', data: message}}); });
  expect(mockInject).not.toHaveBeenCalled();
  await act(async () => { await webview.props.onMessage({nativeEvent: {url: webview.props.source.uri, data: message}}); });
  expect(mockInject).toHaveBeenCalledWith(expect.stringContaining('0 media endpoint'));
  expect(mockInject).toHaveBeenCalledWith(expect.stringContaining('hearth:native-tv-result'));
});

test('loads the TV home with persistent storage and HTTPS-only content', () => {
  const view = render(<App />);
  const webview = view.UNSAFE_getByType('WebView' as never);
  expect(webview.props.source.uri).toMatch(/^https:\/\/.*[?&]tv=1/);
  expect(webview.props.domStorageEnabled).toBe(true);
  expect(webview.props.focusable).toBe(false);
  expect(view.UNSAFE_getAllByType('View' as never)[0].props.hasTVPreferredFocus).toBe(true);
  expect(webview.props.mixedContentMode).toBe('never');
  fireEvent(webview, 'load');
  expect(mockHideSplash).toHaveBeenCalled();
});

test('background and foreground notify the web lifecycle and unmount removes the listener', () => {
  const view = render(<App />);
  act(() => mockAppStateHandler('background'));
  expect(mockInject).toHaveBeenCalledWith('window.hearthPause?.(); true;');
  mockInject.mockClear();
  act(() => mockAppStateHandler('active'));
  expect(mockInject).toHaveBeenCalledWith('window.hearthResume?.(); true;');
  view.unmount();
  expect(mockRemove).toHaveBeenCalled();
});

test('bridges remote presses once without duplicating system key delivery', () => {
  const view = render(<App />);
  expect(view.UNSAFE_getByType('WebView' as never).props.allowSystemKeyEvents).toBe(false);
  act(() => mockTVHandler({eventType: 'right', eventKeyAction: 0}));
  expect(mockInject).toHaveBeenCalledWith('window.hearthRemote?.("ArrowRight"); true;');
  act(() => mockTVHandler({eventType: 'right', eventKeyAction: 1}));
  expect(mockInject).toHaveBeenCalledTimes(1);
  act(() => mockTVHandler({eventType: 'select', eventKeyAction: 0}));
  expect(mockInject).toHaveBeenLastCalledWith('window.hearthRemote?.("Enter"); true;');
  act(() => mockTVHandler({eventType: 'kpenter', eventKeyAction: 0}));
  expect(mockInject).toHaveBeenLastCalledWith('window.hearthRemote?.("Enter"); true;');
  act(() => mockTVHandler({eventType: 'esc', eventKeyAction: 0}));
  expect(mockInject).toHaveBeenLastCalledWith('window.hearthRemote?.("Back"); true;');
});

test('Back reaches the web dialog before the native app exits', () => {
  render(<App />);
  expect(mockBackHandler()).toBe(true);
  expect(mockInject).toHaveBeenCalledWith('window.hearthRemote?.("Back"); true;');
  expect(mockExit).not.toHaveBeenCalled();
});

test('native retry controls retain remote input when the home fails', () => {
  const view = render(<App />);
  fireEvent(view.UNSAFE_getByType('WebView' as never), 'error');
  act(() => mockTVHandler({eventType: 'select', eventKeyAction: 0}));
  expect(mockInject).not.toHaveBeenCalled();
  expect(mockBackHandler()).toBe(false);
});

test('load failure dismisses the splash screen and offers a working retry', () => {
  const view = render(<App />);
  fireEvent(view.UNSAFE_getByType('WebView' as never), 'error');
  expect(mockHideSplash).toHaveBeenCalled();
  expect(view.getByText('Pip’s home is temporarily out of reach.')).toBeTruthy();
  fireEvent.press(view.getByText('Try again'));
  expect(view.UNSAFE_getByType('WebView' as never)).toBeTruthy();
});

test('only main-frame HTTP errors replace the home', () => {
  const view = render(<App />);
  fireEvent(view.UNSAFE_getByType('WebView' as never), 'httpError', {nativeEvent: {isMainFrame: false, statusCode: 503}});
  expect(view.queryByText('Try again')).toBeNull();
  fireEvent(view.UNSAFE_getByType('WebView' as never), 'httpError', {nativeEvent: {isMainFrame: true, statusCode: 503}});
  expect(view.getByText('Try again')).toBeTruthy();
});

test('only the explicit home Back message exits the native app', () => {
  const view = render(<App />);
  const webview = view.UNSAFE_getByType('WebView' as never);
  fireEvent(webview, 'message', {nativeEvent: {data: 'other'}});
  expect(mockExit).not.toHaveBeenCalled();
  fireEvent(webview, 'message', {nativeEvent: {data: 'hearth:exit'}});
  expect(mockExit).toHaveBeenCalledTimes(1);
});
