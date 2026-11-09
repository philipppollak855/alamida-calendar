import { Navigate, Route, Routes } from 'react-router-dom';
import PlanungPage from './planung/PlanungPage';
import BereitschaftPage from './planung/BereitschaftPage';
import AbwesenheitPage from './planung/AbwesenheitPage';
import TelefonPage from './planung/TelefonPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<PlanungPage />} />
      <Route path="/bereitschaft" element={<BereitschaftPage />} />
      <Route path="/abwesenheit" element={<AbwesenheitPage />} />
      <Route path="/telefon" element={<TelefonPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
