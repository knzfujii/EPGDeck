// tslint:disable-next-line: no-import-side-effect
import '@mdi/font/css/materialdesignicons.css';
// tslint:disable-next-line: no-import-side-effect
import 'material-design-icons-iconfont/dist/material-design-icons.css';
// tslint:disable-next-line: no-import-side-effect
import 'typeface-roboto/index.css';
import 'vuetify/dist/vuetify.min.css';
import Vue from 'vue';
import Vuetify from 'vuetify';

Vue.use(Vuetify);

export default new Vuetify({
    icons: {
        iconfont: 'mdi',
    },
});
