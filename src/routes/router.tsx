import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { HomePage } from '../features/home/HomePage'
import { MessagingPage } from '../features/messaging/MessagingPage'
import { SimulatorPage } from '../features/simulator/SimulatorPage'
import { GatewayPage } from '../features/gateway/GatewayPage'
import { SosPage } from '../features/sos/SosPage'

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

const gatewayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/gateway',
  component: GatewayPage,
})

const sosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sos',
  component: SosPage,
})

const routeTree = rootRoute.addChildren([indexRoute, messagingRoute, simulatorRoute, gatewayRoute, sosRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
