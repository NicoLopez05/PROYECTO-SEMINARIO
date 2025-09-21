import { useNavigate } from "react-router-dom";

const acordes = [
  { id: "c", nombre: "Do (C)", img: "/img/acordes/c.png" },
  { id: "g", nombre: "Sol (G)", img: "/img/acordes/g.png" },
  { id: "d", nombre: "Re (D)", img: "/img/acordes/d.png" },
  { id: "em", nombre: "Mi menor (Em)", img: "/img/acordes/em.png" },
  { id: "am", nombre: "La menor (Am)", img: "/img/acordes/am.png" },
];

export default function Acordes() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black/90 text-white p-6">
      <h1 className="text-2xl font-bold mb-6">Lección: Acordes</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
        {acordes.map((a) => (
          <div
            key={a.id}
            onClick={() => navigate(`/guitarra/acordes/${a.id}`)}
            className="cursor-pointer rounded-xl border border-lime-400 p-4 bg-neutral-800 hover:bg-neutral-700"
          >
            <h2 className="text-lg font-semibold mb-3">{a.nombre}</h2>
            <img src={a.img} alt={a.nombre} className="w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
