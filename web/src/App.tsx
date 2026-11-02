import { Navigate, Route, Routes } from 'react-router-dom';
import CalendarPage from './CalendarPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/calendar" replace />} />
      <Route path="/calendar" element={<CalendarPage />} />
    </Routes>
  );
}
