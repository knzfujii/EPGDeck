import * as apid from '../../../api';

export default class RecordedTag {
    public id!: apid.RecordedTagId;
    public name!: string;
    public halfWidthName!: string;
    public color!: string;
}
