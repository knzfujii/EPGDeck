import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventEmitter from 'events';
import ProcessUtil from '../../src/util/ProcessUtil.js';

describe('ProcessUtil Unit Tests', () => {
    describe('isExited', () => {
        it('returns true if exitCode is not null', () => {
            const child: any = { exitCode: 0 };
            expect(ProcessUtil.isExited(child)).toBe(true);
        });

        it('returns false if exitCode is null', () => {
            const child: any = { exitCode: null };
            expect(ProcessUtil.isExited(child)).toBe(false);
        });
    });

    describe('parseCmdStr', () => {
        it('throws CmdParseError when cmd string is empty', () => {
            expect(() => ProcessUtil.parseCmdStr('')).toThrow('CmdBinIsNotFound');
        });

        it('throws CmdBinIsNotFound when binary does not exist', () => {
            expect(() => ProcessUtil.parseCmdStr('/non/existent/binary arg1')).toThrow('CmdBinIsNotFound');
        });

        it('parses valid binary command with %NODE%, %ROOT%, and %SPACE% replacements', () => {
            // Use current node binary which always exists on host
            const nodeBin = process.argv[0];
            const cmd = `%NODE% %ROOT%/test.js hello%SPACE%world extra    args`;

            const parsed = ProcessUtil.parseCmdStr(cmd);
            expect(parsed.bin).toBe(nodeBin);
            expect(parsed.args).toEqual([`${ProcessUtil.ROOT_PATH}/test.js`, 'hello world', 'extra', 'args']);
        });
    });

    describe('kill', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('resolves immediately if process is already exited', async () => {
            const child: any = { exitCode: 0 };
            await expect(ProcessUtil.kill(child)).resolves.toBeUndefined();
        });

        it('closes stdio, sends SIGINT, and resolves when process exits gracefully', async () => {
            const emitter = new EventEmitter();
            const child: any = Object.assign(emitter, {
                exitCode: null,
                stdin: { end: vi.fn() },
                stdout: { unpipe: vi.fn(), destroy: vi.fn(), removeAllListeners: vi.fn() },
                stderr: { unpipe: vi.fn(), destroy: vi.fn(), removeAllListeners: vi.fn() },
                kill: vi.fn((sig: string) => {
                    if (sig === 'SIGINT') {
                        // simulate graceful exit
                        child.exitCode = 0;
                        child.emit('exit', 0);
                    }
                }),
            });

            const killPromise = ProcessUtil.kill(child, 500);
            await killPromise;

            expect(child.stdin.end).toHaveBeenCalled();
            expect(child.stdout.destroy).toHaveBeenCalled();
            expect(child.kill).toHaveBeenCalledWith('SIGINT');
        });

        it('sends SIGKILL if process does not exit within wait timeout', async () => {
            const emitter = new EventEmitter();
            const child: any = Object.assign(emitter, {
                exitCode: null,
                stdin: null,
                stdout: null,
                stderr: null,
                kill: vi.fn(),
            });

            const killPromise = ProcessUtil.kill(child, 500);

            expect(child.kill).toHaveBeenCalledWith('SIGINT');

            // Advance past wait time
            vi.advanceTimersByTime(500);
            expect(child.kill).toHaveBeenCalledWith('SIGKILL');

            // Process exits after SIGKILL
            child.exitCode = 137;
            child.emit('exit', 137);

            await killPromise;
        });
    });
});
