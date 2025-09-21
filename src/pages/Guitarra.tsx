import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase"; // <-- ajusta la ruta si usas alias

const BG_URL = "/img/background-software.png";
type Level = "BÁSICO" | "INTERMEDIO" | "AVANZADO";
type TopicKey = "acordes" | "escalas" | "ritmo" | "tecnicas" | "generos" | "lectura";

const TOPICS: { key: TopicKey; title: string }[] = [
  { key: "acordes",  title: "Acordes" },
  { key: "escalas",  title: "Escalas" },
  { key: "ritmo",    title: "Ritmo" },
  { key: "tecnicas", title: "Técnicas" },
  { key: "generos",  title: "Géneros" },
  { key: "lectura",  title: "Lectura/Tab" },
];

const CONTENT: Record<TopicKey, Record<Level, { intro: string; bullets: string[]; tips?: string[] }>> = {
  acordes: {
    "BÁSICO": {
      intro: "Empieza con triadas abiertas y progresiones I–IV–V.",
      bullets: ["C, G, D, Em, Am", "Cambio limpio entre acordes", "Progresión 12 compases (blues)"],
      tips: ["Practica con metrónomo a 60–80 BPM", "Muteo con mano izquierda para limpiar"]
    },
    "INTERMEDIO": {
      intro: "Aumenta tu vocabulario con cejillas y inversiones.",
      bullets: ["Cejilla en E/A shape", "Inversiones triada en 3 cuerdas", "Dominantes secundarios"],
      tips: ["Arpegia con patrón 1–5–3–5", "Usa capotraste para transportar"]
    },
    "AVANZADO": {
      intro: "Colorea con tensiones y voicings drop-2/4.",
      bullets: ["Maj7, m7, 7(9,13), m7b5", "Drop-2 en cuerdas 2–5", "Cadencias II–V–I con extensiones"],
      tips: ["Voice-leading entre acordes", "Sustituciones tritono"]
    }
  },
  escalas: {
    "BÁSICO": {
      intro: "Pentatónica menor y mayor: base para solos sencillos.",
      bullets: ["Box 1 en 5º traste", "Mayor vs menor (relativas)", "Licks de 2 compases"],
      tips: ["Frasea en 4 compases", "Call & response"]
    },
    "INTERMEDIO": {
      intro: "Mayor natural (modo jónico) y dórico para funk/rock.",
      bullets: ["3NPS mayor", "Dórico sobre II", "Conectar posiciones"],
      tips: ["Accentúa tiempos 2 y 4", "Chromatic approach notes"]
    },
    "AVANZADO": {
      intro: "Armoniza modos y aplica melódica menor.",
      bullets: ["Lidio/ mixolidio", "Melódica menor sobre V7alt", "Superimposición triadas"],
      tips: ["Tensiones 9/#11/13", "Enclosures bebop"]
    }
  },
  ritmo: {
    "BÁSICO": {
      intro: "Rasgueos y patrones regulares.",
      bullets: ["Down/Up 4/4", "Palm mute básico", "Ghost strums"],
      tips: ["Metrónomo 70–90 BPM", "Divide en compases"]
    },
    "INTERMEDIO": {
      intro: "Síncopas y contratiempos.",
      bullets: ["Patrones 16ths", "Anticipaciones", "Funk chucks"],
      tips: ["Subdivision cuenta 1e&a", "Loop 2 compases"]
    },
    "AVANZADO": {
      intro: "Polirritmias y métricas impares.",
      bullets: ["3 sobre 4", "7/8 groove", "Hemiolas"],
      tips: ["Claves rítmicas", "Accent displacement"]
    }
  },
  tecnicas: {
    "BÁSICO": {
      intro: "Construye control y limpieza.",
      bullets: ["Hammer-on / Pull-off", "Slides", "Vibrato básico"],
      tips: ["Economy of motion", "Apagar cuerdas no usadas"]
    },
    "INTERMEDIO": {
      intro: "Expande articulaciones y precisión.",
      bullets: ["Bends 1/2 y tono", "Alternate picking", "Tapping básico"],
      tips: ["Intonación con afinador", "Sincronía mano izq/der"]
    },
    "AVANZADO": {
      intro: "Velocidad y textura avanzada.",
      bullets: ["Sweep picking 3–5 cuerdas", "Hybrid picking", "Legato extendido"],
      tips: ["Rutinas por grupos de 3/5", "Estrategias de relajación"]
    }
  },
  generos: {
    "BÁSICO": {
      intro: "Estructuras simples para tocar canciones.",
      bullets: ["Pop I–V–vi–IV", "Rock power chords", "Balada arpegios"],
      tips: ["Escucha referencias", "Toca encima de backing tracks"]
    },
    "INTERMEDIO": {
      intro: "Lenguajes característicos.",
      bullets: ["Funk 9ths & 13ths", "Blues 12 compases", "Rock riffing pentatónica"],
      tips: ["Tono de mano derecha", "Compases con acentos"]
    },
    "AVANZADO": {
      intro: "Fusión de estilos y reharmonización.",
      bullets: ["Jazz II–V–I extendido", "Metal alternate rápido", "Latin bossa/samba patterns"],
      tips: ["Sustituciones", "Modulaciones breves"]
    }
  },
  lectura: {
    "BÁSICO": {
      intro: "Tablatura y ritmo básico.",
      bullets: ["Leer TAB en 1–5 trastes", "Figuras (negra, corchea)", "Simplificar compases"],
      tips: ["Marca golpes de púa", "Lento → rápido"]
    },
    "INTERMEDIO": {
      intro: "Partitura y posiciones.",
      bullets: ["Clave de sol 1ª posición", "Cifrado americano", "Clic + lectura a primera vista"],
      tips: ["Solfeo práctico", "Diccionario de símbolos"]
    },
    "AVANZADO": {
      intro: "Lectura funcional y de sesión.",
      bullets: ["Lead sheets", "Charts Nashville", "Cambios rápidos"],
      tips: ["Anotar cues", "Agrupar por frases"]
    }
  }
};

const isLevel = (v: any): v is Level =>
  v === "BÁSICO" || v === "INTERMEDIO" || v === "AVANZADO";

export default function Guitarra() {
  const navigate = useNavigate();
  const [level, setLevel] = useState<Level | null>(null);
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [openTopic, setOpenTopic] = useState<TopicKey | null>(null);

  // Cargar nivel desde Supabase (si hay sesión) o localStorage como fallback
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: row, error } = await supabase
            .from("user_settings")
            .select("level")
            .eq("user_id", user.id)
            .maybeSingle();
          if (!error && row && isLevel(row.level)) {
            setLevel(row.level);
            setShowLevelModal(false);
            return;
          }
        }
        // Fallback a localStorage
        const stored = localStorage.getItem("guitar.level");
        if (isLevel(stored)) {
          setLevel(stored);
          setShowLevelModal(false);
        } else {
          setShowLevelModal(true);
        }
      } catch {
        // Si falla Supabase por cualquier motivo, usa localStorage
        const stored = localStorage.getItem("guitar.level");
        if (isLevel(stored)) {
          setLevel(stored);
          setShowLevelModal(false);
        } else {
          setShowLevelModal(true);
        }
      }
    })();
  }, []);

  // ---- NUEVO: guardar nivel en Supabase o localStorage
  async function chooseLevelDB(l: Level) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        localStorage.setItem("guitar.level", l);
      } else {
        // crea perfil si no existe (id = auth.user.id)
        await supabase.from("profiles").upsert({ id: user.id }, { onConflict: "id" });
        await supabase.from("user_settings").upsert({
          user_id: user.id,
          level: l,
          updated_at: new Date().toISOString(),
        });
      }
      setLevel(l);
      setShowLevelModal(false);
    } catch {
      // fallback
      localStorage.setItem("guitar.level", l);
      setLevel(l);
      setShowLevelModal(false);
    }
  }

  const headerTitle = useMemo(
    () => `Guitarra – ${level ?? "elige tu nivel"}`,
    [level]
  );

  return (
    <div
      className="min-h-screen text-gray-100"
      style={{
        backgroundImage: `linear-gradient(to top, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0)), url('${BG_URL}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="mx-auto max-w-[1100px] px-4 py-6">
        {/* Header */}
        <div className="relative rounded-[24px] border-2 border-[#b2ec3a] bg-[#545454]/70 backdrop-blur-sm shadow-inner px-5 py-3 mb-6">
          <button
            onClick={() => navigate("/")}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-black/30 hover:bg-black/40"
            title="Volver al menú"
          >
            <ArrowLeftIcon className="h-6 w-6 text-[#b2ec3a]" />
          </button>

          <div className="flex items-center justify-between pl-8">
            <h2 className="text-xl sm:text-2xl font-extrabold text-black">{headerTitle}</h2>
            <button
              onClick={() => setShowLevelModal(true)}
              className="rounded-xl bg-neutral-900/70 px-3 py-2 text-white hover:bg-neutral-900"
              title="Cambiar nivel"
            >
              Cambiar nivel
            </button>
          </div>
        </div>

        {/* Grid 6 tarjetas */}
        <div className="grid grid-cols-3 gap-5">
          {TOPICS.map((t) => (
            <button
              key={t.key}
              onClick={() => level && setOpenTopic(t.key)}
              className="group relative h-[200px] w-full overflow-hidden
                         rounded-[20px] border-2 border-[#b2ec3a]
                         bg-[#5a5a5a]/50 p-4 shadow-xl outline-none
                         transition-transform hover:scale-[1.02]
                         focus-visible:ring-4 focus-visible:ring-[#b2ec3a]/30"
              title={level ? `Abrir ${t.title}` : "Elige nivel primero"}
              disabled={!level}
            >
              <div
                className="absolute inset-0 -z-10 opacity-15"
                style={{
                  /* FIX del typo en linear-gradient: coma correcta entre los dos rgba */
                  backgroundImage: `linear-gradient(to bottom, rgba(31,31,31,0.35), rgba(35,35,35,0)), url('${BG_URL}')`,
                  backgroundSize: "cover", backgroundPosition: "center"
                }}
              />
              <div className="h-full flex flex-col items-center justify-center">
                <p className="text-2xl font-black tracking-wider text-black">{t.title}</p>
                {!level && <p className="mt-2 text-xs text-white/80">Selecciona un nivel para continuar</p>}
              </div>
              <div className="pointer-events-none absolute inset-0 rounded-[20px] ring-0 ring-[#b2ec3a]/0 transition group-hover:ring-8 group-hover:ring-[#b2ec3a]/20" />
            </button>
          ))}
        </div>
      </div>

      {/* Modal nivel */}
      {showLevelModal && (
        <SmallModal onClose={() => setShowLevelModal(false)} title="¿Cuál es tu nivel?">
          <div className="grid grid-cols-3 gap-3">
            {(["BÁSICO","INTERMEDIO","AVANZADO"] as Level[]).map((l) => (
              <button
                key={l}
                onClick={() => { /* versión con DB */ chooseLevelDB(l); }}

                className="rounded-xl bg-[#b2ec3a] px-3 py-2 text-black font-bold hover:brightness-95"
              >
                {l}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-200">
            Personalizaremos el contenido según tu selección. Podrás cambiarlo luego.
          </p>
        </SmallModal>
      )}

      {/* Modal guía por tema */}
      {openTopic && level && (
        <GuideModal
          topic={openTopic}
          level={level}
          onClose={() => setOpenTopic(null)}
        />
      )}
    </div>
  );
}

/* ----------------- Modales & helpers ----------------- */

function SmallModal({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-[92%] max-w-md rounded-2xl border-2 border-[#b2ec3a] bg-[#545454] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-lg font-bold text-black">{title}</h4>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-black/10" title="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function GuideModal({
  topic, level, onClose,
}: { topic: TopicKey; level: Level; onClose: () => void }) {
  const data = CONTENT[topic][level];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-[92%] max-w-2xl rounded-2xl border-2 border-[#b2ec3a] bg-[#545454] p-5 shadow-2xl">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xl font-bold text-black">
            {titleFor(topic)} · {level}
          </h4>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-black/10" title="Cerrar">✕</button>
        </div>

        <p className="text-sm text-white/90">{data.intro}</p>

        <ul className="mt-3 list-disc pl-6 space-y-1 text-sm">
          {data.bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>

        {data.tips && (
          <>
            <h5 className="mt-4 text-sm font-bold text-black">Tips:</h5>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              {data.tips.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </>
        )}

        <div className="mt-5 flex flex-wrap gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-neutral-900/80 px-4 py-2 text-white hover:bg-neutral-900"
          >
            Cerrar
          </button>
          <a
            href="#"
            className="rounded-xl bg-[#b2ec3a] px-4 py-2 text-black font-bold hover:brightness-95"
            onClick={(e) => e.preventDefault()}
            title="Placeholder para futuras rutas detalladas"
          >
            Ir a lección
          </a>
        </div>
      </div>
    </div>
  );
}

function titleFor(t: TopicKey) {
  return TOPICS.find(x => x.key === t)?.title ?? "";
}

function ArrowLeftIcon({ className = "", size = 24 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H20a1 1 0 1 1 0 2h-9.6l4.3 4.3a1 1 0 1 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" />
    </svg>
  );
}
