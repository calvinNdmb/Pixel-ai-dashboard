/* Pixel's native parts (android/, Kotlin): the share screen and the notification listener run without the app, from the
   address and code mirrored here (setPixel); the rest drives the notification settings. With no Pi linked, the listener
   hands the notifications to the app instead (onNotif, only while the app listens), for the phone's own Pixel. null where
   the module is absent (Expo Go, the web). */
import { NativeModule, requireOptionalNativeModule } from 'expo';

export type PhoneApp = { pkg: string; label: string };
export type NotifSettings = { on: boolean; title: boolean; apps: PhoneApp[]; access: boolean };
export type TestResult = { ok: boolean; message: string };
export type PhoneNotif = { app: string; title?: string; category?: string };   // what Pixel gets: never the text

type Events = { onNotif(n: PhoneNotif): void };

declare class PixelNativeModule extends NativeModule<Events> {
  readonly version: string;
  setPixel(url: string | null): Promise<void>;                 // Pixel's QR code address (http://pixel.local:8080/?t=<code>), or none
  getNotif(): Promise<NotifSettings>;
  setNotifOn(on: boolean): Promise<void>;
  setNotifTitle(on: boolean): Promise<void>;
  setNotifApps(apps: Record<string, string>): Promise<void>;   // package -> label
  notifAccess(): boolean;                                      // Android's "Accès aux notifications" for Pixel
  openNotifAccess(): Promise<boolean>;
  openAppInfo(): Promise<boolean>;
  listApps(): Promise<PhoneApp[]>;                             // the launcher's apps, by name
  sendTest(): Promise<TestResult>;                             // to his Pi, the way the listener sends (a Pi linked)
}

export default requireOptionalNativeModule<PixelNativeModule>('PixelNative');
