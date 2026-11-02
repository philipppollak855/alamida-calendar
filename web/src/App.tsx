import { Navigate, Route, Routes } from 'react-router-dom';
import PlanungPage from './planung/PlanungPage';
import BereitschaftPage from './planung/BereitschaftPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<PlanungPage />} />
      <Route path="/bereitschaft" element={<BereitschaftPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
