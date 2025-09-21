import { Routes, Route, Navigate } from "react-router-dom";
import LearningMenu from "./pages/LearningMenu";   // o donde lo tengas
import Guitarra from "./pages/Guitarra";
import FLPlayground from "./pages/FLPlayground";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LearningMenu />} />
      <Route path="/guitarra" element={<Guitarra />} />
      <Route path="/fl" element={<FLPlayground />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
