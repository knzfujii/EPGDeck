import * as apid from '../../../api';

export default class Rule {
    public id!: apid.RuleId;
    public updateCnt: number = 0;
    public isTimeSpecification: boolean = false;

    public keyword: string | null = null;
    public halfWidthKeyword: string | null = null;
    public ignoreKeyword: string | null = null;
    public halfWidthIgnoreKeyword: string | null = null;
    public keyCS: boolean = false;
    public keyRegExp: boolean = false;
    public name: boolean = false;
    public description: boolean = false;
    public extended: boolean = false;
    public ignoreKeyCS: boolean = false;
    public ignoreKeyRegExp: boolean = false;
    public ignoreName: boolean = false;
    public ignoreDescription: boolean = false;
    public ignoreExtended: boolean = false;
    public GR: boolean = false;
    public BS: boolean = false;
    public CS: boolean = false;
    public SKY: boolean = false;
    public channelIds: string | null = null;
    public genres: string | null = null;
    public times: string | null = null;
    public isFree: boolean = false;
    public durationMin: number | null = null;
    public durationMax: number | null = null;
    public searchPeriods: string | null = null;

    public enable: boolean = false;
    public avoidDuplicate: boolean = false;
    public periodToAvoidDuplicate: number | null = null;
    public allowEndLack: boolean = false;
    public tags: string | null = null;

    public parentDirectoryName: string | null = null;
    public directory: string | null = null;
    public recordedFormat: string | null = null;

    public mode1: string | null = null;
    public parentDirectoryName1: string | null = null;
    public directory1: string | null = null;
    public mode2: string | null = null;
    public parentDirectoryName2: string | null = null;
    public directory2: string | null = null;
    public mode3: string | null = null;
    public parentDirectoryName3: string | null = null;
    public directory3: string | null = null;
    public isDeleteOriginalAfterEncode: boolean = false;
}
