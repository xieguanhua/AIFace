import { createRouter, createWebHashHistory } from 'vue-router'
import AppLayout from '@renderer/layouts/AppLayout.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: AppLayout,
      redirect: '/dashboard',
      children: [
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@renderer/views/DashboardView.vue'),
          meta: { titleKey: 'menu.dashboard' }
        },
        {
          path: 'onboarding',
          name: 'onboarding',
          component: () => import('@renderer/views/OnboardingView.vue'),
          meta: { titleKey: 'onboarding.title' }
        },
        {
          path: 'live',
          name: 'live',
          component: () => import('@renderer/views/LiveView.vue'),
          meta: { titleKey: 'menu.live' }
        },
        {
          path: 'train',
          name: 'train',
          component: () => import('@renderer/views/TrainView.vue'),
          meta: { titleKey: 'menu.train' }
        },
        {
          path: 'assets/faces',
          name: 'assets-faces',
          component: () => import('@renderer/views/AssetsFacesView.vue'),
          meta: { titleKey: 'menu.assetsFaces' }
        },
        {
          path: 'assets/models',
          name: 'assets-models',
          component: () => import('@renderer/views/AssetsModelsView.vue'),
          meta: { titleKey: 'menu.assetsModels' }
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@renderer/views/SettingsView.vue'),
          meta: { titleKey: 'menu.settings' }
        }
      ]
    }
  ]
})

export default router
