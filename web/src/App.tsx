import { Navigate, Route, Routes } from 'react-router-dom';
import PlanungPage from './planung/PlanungPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<PlanungPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
