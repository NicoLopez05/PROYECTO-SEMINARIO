// App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LearningMenu from "./pages/LearningMenu";
import Guitarra from "./pages/Guitarra";
import FLPlayground from "./pages/FLPlayground";
import Acordes from "./pages/guitarra/Acordes";
import AcordeDetalle from "./pages/guitarra/AcordeDetalle";

export default function App() {
  return (
    // ⚠️ Si YA envuelves con <BrowserRouter> en main.tsx, quita BrowserRouter aquí.
    
      <Routes>
        <Route path="/" element={<LearningMenu />} />

        {/* Guitarra */}
        <Route path="/guitarra" element={<Guitarra />} />
        <Route path="/guitarra/acordes" element={<Acordes />} />
        <Route path="/guitarra/acordes/:id" element={<AcordeDetalle />} />

        {/* Otros */}
        <Route path="/fl" element={<FLPlayground />} />

        {/* Catch-all SIEMPRE al final */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    
  );
}
