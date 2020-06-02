import Vue from 'vue'
import VueRouter from 'vue-router'
import Screen from "../views/Screen";


Vue.use(VueRouter);

const routes = [
  {
    path: '/',
    name: 'Screen',
    component: Screen
  }
]

const router = new VueRouter({
  mode: 'history',
  routes
});

export default router
