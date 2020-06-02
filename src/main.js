import Vue from 'vue'
import App from './App.vue'
import router from './router'
import Axios from 'axios'
import { BootstrapVue, IconsPlugin } from 'bootstrap-vue'
import 'bootstrap/dist/css/bootstrap.css'
import 'bootstrap-vue/dist/bootstrap-vue.css'

Vue.config.productionTip = false;
Vue.prototype.$axios = Axios;
Vue.prototype.$http = Axios;

const token = localStorage.getItem('token');
if(token){
  Vue.prototype.$axios.defaults.headers.common['Authorization'] = token;
  Vue.prototype.$AUTH = true;
} else {
  Vue.prototype.$AUTH = false;
}
Vue.use(BootstrapVue)
Vue.use(IconsPlugin)

new Vue({
  router,
  render: h => h(App)
}).$mount('#app')
