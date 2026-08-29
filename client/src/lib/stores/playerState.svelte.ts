/**
 * 動画プレーヤーのグローバル設定 & レジューム位置管理ストア
 */

class PlayerState {
    volume = $state(1.0);
    isMuted = $state(false);
    playbackRate = $state(1.0);
    defaultStreamMode = $state<number>(0);
    defaultStreamType = $state<'hls' | 'mp4' | 'webm'>('hls');

    constructor() {
        if (typeof window !== 'undefined') {
            try {
                const savedVol = localStorage.getItem('epgdeck_volume');
                if (savedVol !== null) this.volume = parseFloat(savedVol);

                const savedMute = localStorage.getItem('epgdeck_muted');
                if (savedMute !== null) this.isMuted = savedMute === 'true';

                const savedRate = localStorage.getItem('epgdeck_playback_rate');
                if (savedRate !== null) this.playbackRate = parseFloat(savedRate);
            } catch (e) {
                console.error('Failed to load player settings', e);
            }
        }
    }

    setVolume(val: number) {
        this.volume = Math.max(0, Math.min(1, val));
        if (typeof window !== 'undefined') {
            localStorage.setItem('epgdeck_volume', this.volume.toString());
        }
    }

    setMuted(val: boolean) {
        this.isMuted = val;
        if (typeof window !== 'undefined') {
            localStorage.setItem('epgdeck_muted', this.isMuted.toString());
        }
    }

    setPlaybackRate(val: number) {
        this.playbackRate = val;
        if (typeof window !== 'undefined') {
            localStorage.setItem('epgdeck_playback_rate', this.playbackRate.toString());
        }
    }

    // レジューム位置（秒）の保存
    savePosition(recordedId: number | string, position: number) {
        if (typeof window === 'undefined' || !recordedId) return;
        try {
            // 最後の30秒以内はレジューム不要（完走とみなす）
            localStorage.setItem(`epgdeck_resume_${recordedId}`, position.toString());
        } catch (e) {
            console.error('Failed to save resume position', e);
        }
    }

    // レジューム位置（秒）の取得
    getPosition(recordedId: number | string): number {
        if (typeof window === 'undefined' || !recordedId) return 0;
        try {
            const pos = localStorage.getItem(`epgdeck_resume_${recordedId}`);
            return pos ? parseFloat(pos) : 0;
        } catch (e) {
            return 0;
        }
    }

    // レジューム位置のクリア
    clearPosition(recordedId: number | string) {
        if (typeof window === 'undefined' || !recordedId) return;
        try {
            localStorage.removeItem(`epgdeck_resume_${recordedId}`);
        } catch (e) {
            // ignore
        }
    }
}

export const playerState = new PlayerState();

