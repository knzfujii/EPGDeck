import { ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Cmds {
    bin: string;
    args: string[];
}

export const ROOT_PATH = path.join(__dirname, '..', '..').replace(new RegExp(`\\${path.sep}$`), '');

/**
 * プロセスが終了しているか
 * @param child ChildProcess
 * @return boolean 終了していれば true を返す
 */
export const isExited = (child: ChildProcess): boolean => {
    return child.exitCode !== null || (typeof child.signalCode !== 'undefined' && child.signalCode !== null);
};

/**
 * セットしたプロセスを前処理をしてから殺す
 * @param child: ChildProcess
 * @param wait: number default 500
 */
export const kill = (child: ChildProcess, wait = 500): Promise<void> => {
    return new Promise<void>((resolve: () => void, reject: (err: Error) => void) => {
        try {
            if (isExited(child)) {
                resolve();
                return;
            }

            if (child.stdin !== null) {
                try {
                    child.stdin.end();
                } catch {}
            }
            if (child.stdout !== null) {
                try {
                    child.stdout.unpipe();
                    child.stdout.destroy();
                    child.stdout.removeAllListeners('data');
                } catch {}
            }
            if (child.stderr !== null) {
                try {
                    child.stderr.unpipe();
                    child.stderr.destroy();
                    child.stderr.removeAllListeners('data');
                } catch {}
            }

            let isDone = false;
            let forceKillTimer: NodeJS.Timeout | null = null;
            const done = () => {
                if (!isDone) {
                    isDone = true;
                    if (forceKillTimer !== null) {
                        clearTimeout(forceKillTimer);
                        forceKillTimer = null;
                    }
                    resolve();
                }
            };

            child.once('exit', done);
            child.once('close', done);

            // まず SIGINT で優雅な終了を試みる
            try {
                child.kill('SIGINT');
            } catch {
                done();
                return;
            }

            // wait 時間内に終了しなければ SIGKILL で強制停止
            forceKillTimer = setTimeout(() => {
                if (!isDone && !isExited(child)) {
                    try {
                        child.kill('SIGKILL');
                    } catch {}
                }
                done();
            }, wait);
        } catch (err: any) {
            reject(err);
        }
    });
};

/**
 * 渡された cmd 文字列を bin と args に分離する
 * @param cmd: string
 * @return Cmds
 */
export const parseCmdStr = (cmd: string): Cmds => {
    let args = cmd.split(' ');
    let bin = args.shift();
    if (typeof bin === 'undefined' || bin.length === 0) {
        throw new Error('CmdBinIsNotFound');
    }

    // %NODE% の replace
    bin = bin.replace(/%NODE%/g, process.argv[0]);

    // bin の存在確認
    try {
        fs.statSync(bin);
    } catch {
        throw new Error('CmdBinIsNotFound');
    }

    args = args
        .map(arg => {
            // 引数内の %ROOT% を置換
            return arg.replace(/%ROOT%/g, ROOT_PATH);
        })
        .map(arg => {
            // 引数内の %SPACE% を半角スペースに置換
            return arg.replace(/%SPACE%/g, ' ');
        });

    return {
        bin: bin,
        args: args.filter(arg => {
            return arg.length > 0;
        }),
    };
};

export const ProcessUtil = {
    ROOT_PATH,
    kill,
    parseCmdStr,
    isExited,
};

// 型参照の後方互換性（ProcessUtil.Cmds）を担保
export namespace ProcessUtil {
    export type Cmds = _Cmds;
}
type _Cmds = Cmds;

export default ProcessUtil;
