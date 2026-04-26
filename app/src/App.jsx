import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { PinGate } from './components/auth/PinGate';

export default function App() {
  return (
    <PinGate>
      <RouterProvider router={router} />
    </PinGate>
  );
}
