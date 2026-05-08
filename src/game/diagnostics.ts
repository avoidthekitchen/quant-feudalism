export type SubsystemLabel =
  | "quantumTrail"
  | "captureSnapshot"
  | "recordSnapshot"
  | "updateDrones"
  | "updateProjectiles"
  | "collapsePlayback"
  | "computeCycle";

export interface FrameRecord {
  deltaMs: number;
  subsystems: Partial<Record<SubsystemLabel, number>>;
  snapshotHistoryLength: number;
  dronesLength: number;
  projectilesLength: number;
  computeCyclePhase: string;
  collapsePlaybackActive: boolean;
  deathSequenceActive: boolean;
}

export interface DiagnosticsExport {
  exportedAt: string;
  totalFramesTracked: number;
  freezes: FrameRecord[];
  recentFrames: FrameRecord[];
  summary: {
    meanFrameMs: number;
    maxFrameMs: number;
    p95FrameMs: number;
    freezeCount: number;
  };
}

const RING_BUFFER_SIZE = 300;
const FREEZE_THRESHOLD_MS = 200;

export class ArenaDiagnostics {
  private ring: FrameRecord[] = [];
  private freezes: FrameRecord[] = [];
  private totalFrames = 0;
  private currentSubsystems: Partial<Record<SubsystemLabel, number>> = {};
  private subsystemStart: Partial<Record<SubsystemLabel, number>> = {};

  beginFrame(): void {
    this.currentSubsystems = {};
  }

  beginSubsystem(label: SubsystemLabel): void {
    this.subsystemStart[label] = performance.now();
  }

  endSubsystem(label: SubsystemLabel): void {
    const start = this.subsystemStart[label];
    if (start !== undefined) {
      this.currentSubsystems[label] = performance.now() - start;
    }
  }

  endFrame(deltaMs: number, context: Omit<FrameRecord, "deltaMs" | "subsystems">): void {
    this.totalFrames += 1;
    const record: FrameRecord = {
      deltaMs,
      subsystems: { ...this.currentSubsystems },
      ...context,
    };

    this.ring.push(record);
    if (this.ring.length > RING_BUFFER_SIZE) {
      this.ring.shift();
    }

    if (deltaMs >= FREEZE_THRESHOLD_MS) {
      this.freezes.push(record);
      if (this.freezes.length > 50) {
        this.freezes.shift();
      }
    }
  }

  export(): DiagnosticsExport {
    const deltas = this.ring.map((r) => r.deltaMs);
    const sorted = [...deltas].sort((a, b) => a - b);
    const sum = deltas.reduce((acc, v) => acc + v, 0);

    return {
      exportedAt: new Date().toISOString(),
      totalFramesTracked: this.totalFrames,
      freezes: [...this.freezes],
      recentFrames: [...this.ring],
      summary: {
        meanFrameMs: deltas.length > 0 ? sum / deltas.length : 0,
        maxFrameMs: sorted[sorted.length - 1] ?? 0,
        p95FrameMs: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        freezeCount: this.freezes.length,
      },
    };
  }

  exportJson(): string {
    return JSON.stringify(this.export(), null, 2);
  }
}
