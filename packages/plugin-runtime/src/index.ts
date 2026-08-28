import type {
  AnalysisIssue,
  EnvironmentReport,
  PluginManifest,
  PolicyDecision,
  ScoreBundle,
} from '@shieldscan/core-schema';

/**
 * Kernel 核心介面。
 *
 * 核心平台不包含任何業務邏輯：不認識 Canvas、不認識 WebGL、不認識評分算法。
 * 它只負責事件總線、插件加載、配置、生命週期、調度與沙箱。
 */
export interface Kernel {
  eventBus: EventBus;
  pluginManager: PluginManager;
  lifecycle: LifecycleManager;
  sandbox: Sandbox;
  bootstrap(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface KernelEvent {
  name: string;
  payload?: unknown;
  at: string;
}

export interface EventBus {
  emit(event: KernelEvent): void;
  on(pattern: string, handler: (event: KernelEvent) => void): () => void;
  off(subscription: () => void): void;
}

export interface PluginManager {
  load(manifest: PluginManifest, impl: Plugin): Promise<void>;
  unload(pluginId: string): Promise<void>;
  reload(pluginId: string): Promise<void>;
  list(): PluginManifest[];
  get(pluginId: string): Plugin | undefined;
}

export interface LifecycleManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  healthCheck(): Promise<boolean>;
}

export interface Sandbox {
  run<T>(pluginId: string, fn: () => Promise<T>): Promise<T>;
}

/** 所有 Plugin 必須實現的基礎介面。 */
export interface Plugin {
  readonly manifest: PluginManifest;
  onLoad(kernel: Kernel): Promise<void>;
  onActivate(kernel: Kernel): Promise<void>;
  onDeactivate(kernel: Kernel): Promise<void>;
  onUnload(kernel: Kernel): Promise<void>;
}

/** 檢測插件：採集原始訊號。 */
export interface DetectionPlugin extends Plugin {
  readonly type: 'detection';
  isSupported(context: unknown): boolean | Promise<boolean>;
  collect(context: unknown): Promise<unknown>;
}

/** 分析插件：把多個原始訊號組合成判斷。 */
export interface AnalysisPlugin extends Plugin {
  readonly type: 'analysis';
  analyze(report: EnvironmentReport): Promise<AnalysisIssue[]>;
}

/** 評分插件：產生分數。 */
export interface ScoringPlugin extends Plugin {
  readonly type: 'scoring';
  score(report: EnvironmentReport, issues: AnalysisIssue[]): Promise<ScoreBundle>;
}

/** 政策插件：把分數轉成商業決策。 */
export interface PolicyPlugin extends Plugin {
  readonly type: 'policy';
  decide(input: {
    report: EnvironmentReport;
    scores: ScoreBundle;
    issues: AnalysisIssue[];
  }): Promise<PolicyDecision>;
}

/** 輸出插件：把結果輸出到不同渠道。 */
export interface OutputPlugin extends Plugin {
  readonly type: 'output';
  deliver(input: { report: EnvironmentReport }): Promise<void>;
}
