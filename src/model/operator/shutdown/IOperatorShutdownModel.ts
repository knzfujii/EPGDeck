import * as child_process from 'child_process';

export default interface IOperatorShutdownModel {
    setServiceChild(child: child_process.ChildProcess | null): void;
    setServiceRestartTimerClearer(clearer: () => void): void;
    shutdown(signal: string): Promise<void>;
    isShuttingDown(): boolean;
}
