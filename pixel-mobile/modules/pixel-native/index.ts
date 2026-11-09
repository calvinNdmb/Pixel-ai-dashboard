/* Pixel's native parts (android/, Kotlin): the share screen and the notification listener run without the app, from the
   address and code mirrored here (setPixel); the rest drives the notification settings. null where the module is absent
   (Expo Go, the web). */
import { NativeModule, requireOptionalNativeModule } from 'expo';

export type PhoneApp = { pkg: string; label: string };
export type NotifSettings = { on: boolean; title: boolean; apps: PhoneApp[]; access: boolean };
export type TestResult = { ok: boolean; message: string };

declare class PixelNativeModule extends NativeModule {
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
  sendTest(): Promise<TestResult>;
}

export default requireOptionalNativeModule<PixelNativeModule>('PixelNative');
