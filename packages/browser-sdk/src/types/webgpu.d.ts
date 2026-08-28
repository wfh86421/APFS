/**
 * 最小 WebGPU 環境型別宣告。
 *
 * TS 標準 lib.dom 尚未收錄 WebGPU（2026 仍在演進），
 * 這裡只宣告 browser-sdk 實際使用的 API 子集；
 * 完整型別可於日後改用 @webgpu/types。
 */

interface GPUAdapterInfo {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
  driver: string;
}

interface GPUAdapter {
  readonly limits: Record<string, number>;
  readonly features: readonly string[];
  requestAdapterInfo(): Promise<GPUAdapterInfo>;
  requestDevice(): Promise<GPUDevice>;
}

interface GPUDevice {}

interface GPU {
  requestAdapter(): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): string;
}

interface Navigator {
  readonly gpu?: GPU;
}
