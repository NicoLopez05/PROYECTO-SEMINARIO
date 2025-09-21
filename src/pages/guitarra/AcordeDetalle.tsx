import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import * as tf from "@tensorflow/tfjs";

// ------------------- Mapa de acordes -------------------
type Acorde = {
  nombre: string;
  img: string;
  // notas objetivo (pitch class, sin octava) - p.ej. "C","E","G"
  notas: string[];
  // sugerencia de digitación abierta (para mostrar texto)
  dig: string;
};

const ACORDES: Record<string, Acorde> = {
  // Mayores abiertos
  c:  { nombre: "Do mayor (C)",  img: "/img/acordes/c.png",  notas: ["C","E","G"],     dig: "x-3-2-0-1-0" },
  g:  { nombre: "Sol mayor (G)", img: "/img/acordes/g.png",  notas: ["G","B","D"],     dig: "3-2-0-0-0-3" },
  d:  { nombre: "Re mayor (D)",  img: "/img/acordes/d.png",  notas: ["D","F#","A"],    dig: "x-x-0-2-3-2" },
  a:  { nombre: "La mayor (A)",  img: "/img/acordes/a.png",  notas: ["A","C#","E"],    dig: "x-0-2-2-2-0" },
  e:  { nombre: "Mi mayor (E)",  img: "/img/acordes/e.png",  notas: ["E","G#","B"],    dig: "0-2-2-1-0-0" },
  f:  { nombre: "Fa mayor (F)",  img: "/img/acordes/f.png",  notas: ["F","A","C"],     dig: "1-3-3-2-1-1 (cejilla 1)" },

  // Menores abiertos
  am: { nombre: "La menor (Am)", img: "/img/acordes/am.png", notas: ["A","C","E"],     dig: "x-0-2-2-1-0" },
  em: { nombre: "Mi menor (Em)", img: "/img/acordes/em.png", notas: ["E","G","B"],     dig: "0-2-2-0-0-0" },
  dm: { nombre: "Re menor (Dm)", img: "/img/acordes/dm.png", notas: ["D","F","A"],     dig: "x-x-0-2-3-1" },

  // Séptimas típicas (opcional)
  e7: { nombre: "Mi 7 (E7)",     img: "/img/acordes/e7.png", notas: ["E","G#","B","D"], dig: "0-2-0-1-0-0" },
  a7: { nombre: "La 7 (A7)",     img: "/img/acordes/a7.png", notas: ["A","C#","E","G"], dig: "x-0-2-0-2-0" },
  d7: { nombre: "Re 7 (D7)",     img: "/img/acordes/d7.png", notas: ["D","F#","A","C"], dig: "x-x-0-2-1-2" },
  g7: { nombre: "Sol 7 (G7)",    img: "/img/acordes/g7.png", notas: ["G","B","D","F"],  dig: "3-2-0-0-0-1" },
  cmaj7: { nombre: "Cmaj7",     img: "/img/acordes/cmaj7.png", notas: ["C","E","G","B"], dig: "x-3-2-0-0-0" },
};

// ------------------- Utilidades notas/frecuencias -------------------
// afinación estándar E2 A2 D3 G3 B3 E4
const A4_FREQ = 440;
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"] as const;
type PC = (typeof NOTE_NAMES)[number];

function midiToFreq(m: number) {
  return A4_FREQ * Math.pow(2, (m - 69) / 12);
}
function freqToMidi(f: number) {
  return Math.round(69 + 12 * Math.log2(f / A4_FREQ));
}
function midiToNoteName(m: number): PC {
  return NOTE_NAMES[(m % 12 + 12) % 12];
}
function freqToPitchClass(f: number): PC {
  return midiToNoteName(freqToMidi(f));
}

// rango razonable de guitarra (E2=82.41 Hz a ~E6=1318.5 Hz)
const MIN_FREQ = 75;
const MAX_FREQ = 1500;

// ------------------- Componente -------------------
export default function AcordeDetalle() {
  const { id = "c" } = useParams();
  const acorde = useMemo(() => ACORDES[id] ?? ACORDES.c, [id]);

  // UI/estado
  const [status, setStatus] = useState<"idle"|"listening"|"analysing"|"ok"|"bad">("idle");
  const [detected, setDetected] = useState<PC[]>([]);
  const [msg, setMsg] = useState<string>("");
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameBufRef = useRef<Float32Array[]>([]); // para IA (ventana de espectros)
  // cuánto tiempo escuchar antes de evaluar
  const LISTEN_SECONDS = 20;

// refs de control
  const rafRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const [volume, setVolume] = useState(0); // volumen actual (0–1)
  const [liveNote, setLiveNote] = useState<PC | null>(null); // nota dominante actual





  
  // ---------- Opción 1: FFT básica ----------
  async function startMicBasic() {
  setMsg("");
  setDetected([]);
  setStatus("listening");
  frameBufRef.current = []; // limpiar buffer para IA

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 44100,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    video: false,
  });
  streamRef.current = stream;

  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  await ctx.resume(); // asegura estado 'running' tras el click
  ctxRef.current = ctx;

  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0;
  src.connect(analyser);
  analyserRef.current = analyser;

  const tmp = new Float32Array(analyser.frequencyBinCount);
  const framesLocal: Float32Array[] = [];
  const sr = ctx.sampleRate;
  const hzPerBin = sr / analyser.fftSize;

  const t0 = performance.now();

  const loop = () => {
    if (!analyserRef.current) return; // si ya se detuvo
    analyser.getFloatFrequencyData(tmp);
    // ---- Calcular volumen RMS (para la barra) ----
const timeData = new Uint8Array(analyser.fftSize);
analyser.getByteTimeDomainData(timeData);
let sum = 0;
for (let i = 0; i < timeData.length; i++) {
  const v = (timeData[i] - 128) / 128;
  sum += v * v;
}
setVolume(Math.sqrt(sum / timeData.length)); // 0 a ~1

// ---- Nota más fuerte (pico en espectro) ----
let peakIndex = 0;
let peakValue = -Infinity;
for (let i = 0; i < tmp.length; i++) {
  if (tmp[i] > peakValue) {
    peakValue = tmp[i];
    peakIndex = i;
  }
}
const peakFreq = peakIndex * hzPerBin;
if (peakFreq >= MIN_FREQ && peakFreq <= MAX_FREQ) {
  const pc = freqToPitchClass(peakFreq);
  setLiveNote(pc);
}



    // guarda frame para IA y para la evaluación básica
    const copy = Float32Array.from(tmp);
    frameBufRef.current.push(copy);
    framesLocal.push(copy);

    // seguir hasta cumplir la ventana
    const elapsed = (performance.now() - t0) / 1000;
    if (elapsed < LISTEN_SECONDS) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    // alcanzado el tiempo objetivo -> finalizar con evaluación
    finalizeEvaluation(framesLocal, hzPerBin);
  };

  // “seguro” por si la pestaña pierde rAF (minimizada, etc.)
  if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
  stopTimerRef.current = window.setTimeout(() => {
    finalizeEvaluation(framesLocal, hzPerBin);
  }, LISTEN_SECONDS * 1000);

  rafRef.current = requestAnimationFrame(loop);
}
function finalizeEvaluation(frames: Float32Array[], hzPerBin: number) {
  // si ya se evaluó y se limpió, evita doble ejecución
  if (!analyserRef.current && !streamRef.current && !ctxRef.current && status !== "listening") return;

  // Tally de picos por nota
  const tally: Record<PC, number> = Object.fromEntries(
    (NOTE_NAMES as readonly PC[]).map(n => [n, 0])
  ) as any;

  const bins = frames[0]?.length ?? 0;
  const spec = new Float32Array(bins);

  frames.forEach(f => {
    // copia (evita mutar)
    for (let i = 0; i < bins; i++) spec[i] = f[i];
    for (let i = 1; i < bins - 1; i++) {
      const db = spec[i];
      if (db > spec[i - 1] && db > spec[i + 1] && db > -70) {
        const fHz = i * hzPerBin;
        if (fHz >= MIN_FREQ && fHz <= MAX_FREQ) {
          const pc = freqToPitchClass(fHz);
          tally[pc]++;
        }
      }
    }
  });

  const topPCs = Object.entries(tally)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 6)
    .filter(([, c]) => (c as number) > 0)
    .map(([pc]) => pc as PC);

  setDetected(topPCs);
  const ok = matchesChord(topPCs, acorde.notas);
  setStatus(ok ? "ok" : "bad");
  setMsg(ok ? "¡Bien! El acorde suena correcto ✅"
            : "No coincide del todo. Revisa cuerdas muteadas o desafinadas.");

  // detener todo (sin limpiar mensajes)
  stopMic(false);
}


  function matchesChord(detectedPCs: PC[], chordPCs: string[]) {
    const need = new Set(chordPCs as PC[]);
    const have = new Set(detectedPCs);
    // Debe contener todas las notas del acorde (toleramos notas extra)
    for (const pc of need) if (!have.has(pc)) return false;
    return true;
  }

  // ---------- Opción 2: IA con TensorFlow.js ----------
  // Crea un tensor [frames, bins] de las últimas capturas y lo pasa al modelo
  async function analyseWithTFJS() {
    setStatus("analysing");
    try {
      // Cargar el modelo si lo tienes exportado a TFJS
      // Colócalo en: public/models/chords/model.json
      const model = await tf.loadLayersModel("/models/chords/model.json");

      // Preprocesamiento simple: normalizar cada espectro y apilar
      const frames = frameBufRef.current.slice(-64); // usa las 64 últimas
      if (frames.length < 16) {
        setMsg("Aún no hay suficiente audio. Toca unos segundos más.");
        setStatus("listening");
        return;
      }
      const maxBins = Math.min(1024, frames[0].length);
      const stack = frames.map(f => {
        const sliced = f.slice(0, maxBins);
        // dB (negativos) -> [0..1]
        const arr = Array.from(sliced, x => Math.max(0, Math.min(1, (x + 120) / 80)));
        return arr;
      });
      // tensor shape [T, F] -> [1, T, F, 1] para convs 2D
      const input = tf.tensor(stack).expandDims(0).expandDims(-1);
      const pred = model.predict(input) as tf.Tensor;
      const probs = await pred.data();
      input.dispose(); pred.dispose();

      // Mapea índices -> nombres de acordes (según entrenamiento)
      // Debe coincidir con el orden usado al entrenar:
      const CLASSES = Object.keys(ACORDES); // ejemplo simple
      let best = 0, bi = 0;
      probs.forEach((p, i) => { if (p > best) { best = p; bi = i; } });

      const topChordKey = CLASSES[bi] || "c";
      const topChord = ACORDES[topChordKey];
      const ok = topChordKey === (id || "c");
      setStatus(ok ? "ok" : "bad");
      setMsg(ok
        ? `Modelo: ${topChord.nombre} ✓`
        : `Modelo detectó: ${topChord.nombre}. Revisa digitación/tuning.`);
    } catch (e:any) {
      console.error(e);
      setMsg("No se pudo cargar/usar el modelo TFJS. Revisa /models/chords.");
      setStatus("listening");
    }
  }

  async function startBoth() {
    // reinicia buffers para IA
    frameBufRef.current = [];
    await startMicBasic();
    // Nota: la IA usa los frames que se van acumulando mientras el mic está activo.
    // Si quieres forzarla inmediatamente, podrías llamar a analyseWithTFJS() tras 2–3 s.
  }

  function stopMic(reset = true) {
  if (stopTimerRef.current) {
    clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
  }
  if (rafRef.current != null) {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }
  analyserRef.current?.disconnect();
  analyserRef.current = null;

  if (ctxRef.current) {
    try { ctxRef.current.close(); } catch {}
    ctxRef.current = null;
  }
  if (streamRef.current) {
    try { streamRef.current.getTracks().forEach(t => t.stop()); } catch {}
    streamRef.current = null;
  }

  if (reset) {
    setStatus("idle");
    setDetected([]);
    setMsg("");
  }
}


  useEffect(() => () => stopMic(), []);

  return (
    <div className="min-h-screen bg-black/90 text-white p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold">{acorde.nombre}</h1>
        <p className="opacity-80 mb-2">Digitación sugerida: <code>{acorde.dig}</code></p>
        <img src={acorde.img} alt={acorde.nombre} className="my-4 w-72 rounded-lg border border-lime-400" />

        <div className="flex gap-3 mb-3">
          {status !== "listening" ? (
            <button
              onClick={startBoth}
              className="rounded-xl bg-lime-400 px-4 py-2 text-black font-bold hover:brightness-95"
            >
              Activar micrófono 🎤 (20 s)
            </button>
          ) : (
            <button
              onClick={() => stopMic()}
              className="rounded-xl bg-red-500 px-4 py-2 text-white font-bold hover:brightness-95"
            >
              Detener
            </button>
          )}

          <button
            onClick={analyseWithTFJS}
            className="rounded-xl bg-sky-400 px-4 py-2 text-black font-bold hover:brightness-95 disabled:opacity-50"
            disabled={status === "idle"}
            title="Usar modelo TFJS (si está disponible)"
          >
            Evaluar con IA (TFJS)
          </button>
        </div>
                {/* Barra de volumen */}
        <div className="w-full h-4 bg-neutral-800 rounded overflow-hidden mb-4">
        <div
            className="h-full bg-lime-400 transition-all"
            style={{ width: `${Math.min(100, volume * 200)}%` }}
        />
        </div>

        {/* Nota en tiempo real */}
        <div className="mb-2 text-lg">
        Nota actual: <b>{liveNote ?? "—"}</b>
        </div>

        {/* Estado visual */}
        <div className="flex gap-2 mb-4">
        <span className={`px-3 py-1 rounded ${status === "ok" ? "bg-lime-500 text-black" : "bg-neutral-700 text-gray-300"}`}>
            OK
        </span>
        <span className={`px-3 py-1 rounded ${status === "bad" ? "bg-red-500 text-white" : "bg-neutral-700 text-gray-300"}`}>
            BAD
        </span>
        </div>
  
        <div className="text-sm mb-4">
          <div>Notas objetivo: <b>{acorde.notas.join("  •  ")}</b></div>
          <div>Notas detectadas: <span className="opacity-90">{detected.join("  ·  ") || "—"}</span></div>
        </div>

        {msg && (
          <div
            className={
              "rounded-lg px-4 py-3 font-semibold " +
              (status === "ok" ? "bg-lime-500/20 text-lime-300 border border-lime-400" :
               status === "bad" ? "bg-amber-500/10 text-amber-300 border border-amber-400" :
               "bg-neutral-800 border border-neutral-700")
            }
          >
            {msg}
          </div>
        )}

        <p className="mt-6 text-sm opacity-70">
          Consejo: afina la guitarra y toca todas las cuerdas del acorde con ataque constante.
          El veredicto básico usa picos de espectro (FFT). La opción de IA requiere un modelo TFJS entrenado.
        </p>
      </div>
    </div>
  );
}





