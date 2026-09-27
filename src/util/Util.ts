/**
 * sleep
 * @param msec: ミリ秒
 */
export const sleep = (msec: number): Promise<void> => {
    return new Promise(resolve => {
        setTimeout(resolve, msec);
    });
};

export const Util = {
    sleep,
};

export default Util;
