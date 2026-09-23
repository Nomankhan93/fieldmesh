import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { HomePage } from '../features/home/HomePage'
import { MessagingPage } from '../features/messaging/MessagingPage'
import { SimulatorPage } from '../features/simulator/SimulatorPage'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

const messagingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/messages',
  component: MessagingPage,
})

const simulatorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/simulator',
  component: SimulatorPage,
})

const routeTree = rootRoute.addChildren([indexRoute, messagingRoute, simulatorRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
