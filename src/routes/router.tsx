import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { AppShell } from '../features/shell/AppShell'
import { HomePage } from '../features/home/HomePage'

const LazyMessagingPage = lazy(async () => ({ default: (await import('../features/messaging/MessagingPage')).MessagingPage }))
const LazySimulatorPage = lazy(async () => ({ default: (await import('../features/simulator/SimulatorPage')).SimulatorPage }))
const LazyGatewayPage = lazy(async () => ({ default: (await import('../features/gateway/GatewayPage')).GatewayPage }))
const LazySosPage = lazy(async () => ({ default: (await import('../features/sos/SosPage')).SosPage }))
const LazyNetworkStatusPage = lazy(async () => ({ default: (await import('../features/network/NetworkStatusPage')).NetworkStatusPage }))
const LazyIdentityDashboard = lazy(async () => ({ default: (await import('../features/identity/IdentityDashboard')).IdentityDashboard }))
const LazyDeveloperHomePage = lazy(async () => ({ default: (await import('../features/developer/DeveloperHomePage')).DeveloperHomePage }))
const LazySecurityFoundationPage = lazy(async () => ({ default: (await import('../features/security/SecurityFoundationPage')).SecurityFoundationPage }))

function withRouteSuspense(Page: LazyExoticComponent<ComponentType>) {
  return function LazyRoutePage() {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Page />
      </Suspense>
    )
  }
}

function RouteFallback() {
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading…</div>
    </main>
  )
}

const MessagingRoutePage = withRouteSuspense(LazyMessagingPage)
const SimulatorRoutePage = withRouteSuspense(LazySimulatorPage)
const GatewayRoutePage = withRouteSuspense(LazyGatewayPage)
const SosRoutePage = withRouteSuspense(LazySosPage)
const NetworkRoutePage = withRouteSuspense(LazyNetworkStatusPage)
const ProfileRoutePage = withRouteSuspense(LazyIdentityDashboard)
const DeveloperHomeRoutePage = withRouteSuspense(LazyDeveloperHomePage)
const SecurityFoundationRoutePage = withRouteSuspense(LazySecurityFoundationPage)

const rootRoute = createRootRoute({ component: AppShell })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

const messagingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/messages',
  component: MessagingRoutePage,
})

const sosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sos',
  component: SosRoutePage,
})

const networkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/network',
  component: NetworkRoutePage,
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: ProfileRoutePage,
})

const developerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/developer',
  component: DeveloperHomeRoutePage,
})

const developerMeshRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/developer/mesh',
  component: SimulatorRoutePage,
})

const developerGatewayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/developer/gateway',
  component: GatewayRoutePage,
})

const developerSecurityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/developer/security',
  component: SecurityFoundationRoutePage,
})

// Compatibility aliases for bookmarks created before the product-shell split.
const simulatorAliasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/simulator',
  component: SimulatorRoutePage,
})

const gatewayAliasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/gateway',
  component: GatewayRoutePage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  messagingRoute,
  sosRoute,
  networkRoute,
  profileRoute,
  developerRoute,
  developerMeshRoute,
  developerGatewayRoute,
  developerSecurityRoute,
  simulatorAliasRoute,
  gatewayAliasRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
