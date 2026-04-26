import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { LoginGate } from './components/auth/LoginGate';

export default function App() {
  return (
    <LoginGate>
      <RouterProvider router={router} />
    </LoginGate>
  );
}
