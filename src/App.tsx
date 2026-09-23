import { RouterProvider } from '@tanstack/react-router'
import { AuthProvider } from './features/auth/AuthProvider'
import { router } from './routes/router'

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
