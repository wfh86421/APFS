/**
 * Navigator 擴充型別宣告。
 *
 * navigator.userAgentData（Client Hints API）尚未收錄於 TS 標準 lib.dom，
 * 這裡宣告 browser-sdk 實際使用的子集。
 */

interface NavigatorUABrandVersion {
  brand: string;
  version: string;
}

interface NavigatorUAData {
  readonly brands: NavigatorUABrandVersion[];
  readonly mobile: boolean;
  readonly platform: string;
  getHighEntropyValues(
    hints: string[],
  ): Promise<{
    architecture?: string;
    bitness?: string;
    model?: string;
    platformVersion?: string;
    fullVersionList?: NavigatorUABrandVersion[];
    uaFullVersion?: string;
  }>;
}

interface Navigator {
  readonly userAgentData?: NavigatorUAData;
}
