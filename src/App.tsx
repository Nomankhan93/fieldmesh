import { RouterProvider } from '@tanstack/react-router'
import { AuthProvider } from './features/auth/AuthProvider'
import { PwaProvider } from './features/pwa/PwaProvider'
import { router } from './routes/router'

export default function App() {
  return (
    <PwaProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </PwaProvider>
  )
}
