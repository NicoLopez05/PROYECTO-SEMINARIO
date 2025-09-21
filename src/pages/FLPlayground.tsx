//MIAU
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Tone from "tone";
import { useNavigate} from "react-router-dom";

// ⬇️ NUEVO: helpers para local y nube
import { getDeviceId } from "../lib/device";
import { listLocalPatterns, saveLocalPattern, loadLocalPattern } from "../lib/presets";
import type { PatternSnapshot } from "../lib/presets";

import {
  uploadPatternJSON,
  listCloudPatterns,
  downloadPatternJSON,
} from "../lib/cloud";

const BG_URL = "/img/background-software.png";
const DEFAULT_BPM = 120;

// Notas descendentes de una octava (B..C) para el piano roll
function makeNotes(oct: number): string[] {
  return ["B","A#","A","G#","G","F#","F","E","D#","D","C#","C"].map(n => `${n}${oct}`);
}

// Transponer una nota por semitonos (clamp 0–127)
function transpose(note: string, semitones: number): string {
  const midi = Tone.Frequency(note).toMidi();
  const t = Math.max(0, Math.min(127, midi + semitones));
  return Tone.Frequency(t, "midi").toNote();
}

type GridState = boolean[][];
type SelectedFx =
  | "comp" | "reverb" | "delay" | "chorus" | "distortion" | "bitcrush" | "lowpass"
  | "eq3" | "eq8"
  | null;

type FxState = {
  comp: boolean;
  reverb: boolean;
  delay: boolean;
  chorus: boolean;
  distortion: boolean;
  bitcrush: boolean;
  lowpass: boolean;
  eq3: boolean;
  eq8: boolean;
};

// Frecuencias para EQ8 (Hz)
const EQ8_FREQS = [60, 120, 250, 500, 1000, 2000, 4000, 8000] as const;
type Eq8Freq = typeof EQ8_FREQS[number];

export default function FLPlayground() {
  const navigate = useNavigate();

  const [bpm, setBpm] = useState<number>(DEFAULT_BPM);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Octava y pitch global
  const [octave, setOctave] = useState<number>(5);
  const [pitch, setPitch] = useState<number>(0); // –12..+12
  const NOTES = useMemo(() => makeNotes(octave), [octave]);

  // Pasos variables (16 / 32)
  const [steps, setSteps] = useState<number>(16);
  const [grid, setGrid] = useState<GridState>(Array.from({ length: 12 }, () => Array(16).fill(false)));
  const [activeCol, setActiveCol] = useState<number | null>(null);

  // Instrumento: Sampler o Synth
  const [samplerUrl, setSamplerUrl] = useState<string | null>(null);
  const synthRef = useRef<Tone.Synth | null>(null);
  const samplerRef = useRef<Tone.Sampler | null>(null);
  const playerRef = useRef<Tone.Player | null>(null); // Player para sample completo
  const instrumentRef = useRef<Tone.Instrument | null>(null);

  // Bus de entrada común (instrumento + player) → FX → destino
  const inputBus = useRef<Tone.Gain | null>(null);

  // FX toggles
  const [fx, setFx] = useState<FxState>({
    comp: true,
    reverb: false,
    delay: false,
    chorus: false,
    distortion: false,
    bitcrush: false,
    lowpass: false,
    eq3: true,
    eq8: false,
  });

  // Nodos FX
  const nodes = useMemo(() => {
    // EQ3
    const eq3 = new Tone.EQ3({
      low: 0, mid: 0, high: 0,
      lowFrequency: 200,
      highFrequency: 2000,
    });

    // EQ8 como 8 filtros peaking en serie (entrada→f1→...→f8→salida)
    const eq8Start = new Tone.Gain(1);
    const eq8End = new Tone.Gain(1);
    const eq8Bands = EQ8_FREQS.map((f) =>
      new Tone.Filter({ type: "peaking", frequency: f, Q: 1.0, gain: 0 })
    );
    // Conexión interna del EQ8 (serie)
    if (eq8Bands.length > 0) {
      eq8Start.connect(eq8Bands[0]);
      for (let i = 0; i < eq8Bands.length - 1; i++) {
        eq8Bands[i].connect(eq8Bands[i + 1]);
      }
      eq8Bands[eq8Bands.length - 1].connect(eq8End);
    } else {
      eq8Start.connect(eq8End);
    }

    return {
      // Efectos
      lowpass: new Tone.Filter({ type: "lowpass", frequency: 14000, Q: 0.7, rolloff: -24 }),
      eq3,
      eq8Start,
      eq8End,
      eq8Bands,
      comp: new Tone.Compressor({ threshold: -24, ratio: 4 }),
      chorus: new Tone.Chorus({ frequency: 1.5, depth: 0.5, wet: 0.25 }).start(),
      delay: new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.25, wet: 0.2 }),
      reverb: new Tone.Reverb({ decay: 2.8, wet: 0.25 }),
      distortion: new Tone.Distortion({ distortion: 0.2, wet: 0.15 }),
      bitcrush: new Tone.BitCrusher({ bits: 6, wet: 0.2 }),
      meter: new Tone.Meter(),
    };
  }, []);

  /** reconstruye cadena (inputBus -> FX seleccionados -> destino) y conecta fuentes al bus */
  function rebuildChain() {
    inputBus.current?.disconnect();

    const chain: (Tone.ToneAudioNode | AudioNode)[] = [];
    // Orden sugerido
    if (fx.lowpass) chain.push(nodes.lowpass);
    if (fx.eq3)     chain.push(nodes.eq3);
    if (fx.eq8)     chain.push(nodes.eq8Start, nodes.eq8End); // serie interna ya conectada
    if (fx.comp)    chain.push(nodes.comp);
    if (fx.chorus)  chain.push(nodes.chorus);
    if (fx.delay)   chain.push(nodes.delay);
    if (fx.reverb)  chain.push(nodes.reverb);
    if (fx.distortion) chain.push(nodes.distortion);
    if (fx.bitcrush)   chain.push(nodes.bitcrush);

    chain.push(nodes.meter, Tone.getDestination());

    if (inputBus.current) {
      if (chain.length) (inputBus.current as any).chain(...chain);
      else inputBus.current.connect(Tone.getDestination());
    }

    // Reconectar fuentes al bus
    instrumentRef.current?.disconnect();
    playerRef.current?.disconnect();
    if (instrumentRef.current && inputBus.current) {
      (instrumentRef.current as any).connect(inputBus.current);
    }
    if (playerRef.current && inputBus.current) {
      playerRef.current.connect(inputBus.current);
    }
  }

  /** inicialización: bus + synth por defecto */
  useEffect(() => {
    inputBus.current = new Tone.Gain(1);

    const synth = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.4 },
    });
    synthRef.current = synth;
    instrumentRef.current = synth;

    if (inputBus.current) synth.connect(inputBus.current);
    rebuildChain();

    return () => {
      synth.dispose();
      inputBus.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** fx cambió */
  useEffect(() => {
    rebuildChain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx]);

  /** carga de sample (local: blob:) */
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setSamplerUrl(url);
  }

  /** crea sampler y player cuando hay url */
  useEffect(() => {
    if (!samplerUrl) return;

    // Sampler (para notas del piano roll)
    const sampler = new Tone.Sampler({
      urls: { C4: samplerUrl },
      onload: () => {
        instrumentRef.current = sampler;
        if (inputBus.current) sampler.connect(inputBus.current);
        rebuildChain();
      },
    });
    samplerRef.current = sampler;

    // Player (reproducir sample completo)
    const player = new Tone.Player({ url: samplerUrl, autostart: false });
    playerRef.current = player;
    if (inputBus.current) player.connect(inputBus.current);

    return () => {
      sampler.disconnect(); sampler.dispose(); samplerRef.current = null;
      player.disconnect();  player.dispose();  playerRef.current = null;

      instrumentRef.current = synthRef.current; // fallback
      if (instrumentRef.current && inputBus.current) {
        (instrumentRef.current as any).connect(inputBus.current);
      }
      rebuildChain();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samplerUrl]);

  /** secuenciador */
  useEffect(() => {
    Tone.Transport.bpm.rampTo(bpm, 0.05);
    Tone.Transport.cancel(0);

    const loop = new Tone.Sequence(
      (time, idx) => {
        const c = idx as number;
        setActiveCol(c);

        const currentNotes = NOTES;
        currentNotes.forEach((note, r) => {
          if (grid[r][c]) {
            const n = transpose(note, pitch);
            if (instrumentRef.current instanceof Tone.Sampler) {
              (instrumentRef.current as Tone.Sampler).triggerAttackRelease(n, "16n", time);
            } else if (instrumentRef.current instanceof Tone.Synth) {
              (instrumentRef.current as Tone.Synth).triggerAttackRelease(n, "16n", time);
            }
          }
        });
      },
      Array.from({ length: steps }, (_, i) => i),
      "16n"
    ).start(0);

    return () => loop.dispose();
  }, [grid, bpm, steps, NOTES, pitch]);

  async function togglePlay() {
    await Tone.start();
    if (isPlaying) {
      Tone.Transport.stop();
      setActiveCol(null);
    } else {
      Tone.Transport.start();
    }
    setIsPlaying(!isPlaying);
  }

  function toggleCell(r: number, c: number) {
    setGrid((g) => {
      const next = g.map((row) => row.slice());
      next[r][c] = !next[r][c];
      return next;
    });
  }

  function clearGrid() {
    setGrid(Array.from({ length: 12 }, () => Array(steps).fill(false)));
  }

  // Cambiar 16/32 pasos (manteniendo lo ya programado en el rango)
  function setStepsCount(n: number) {
    setSteps(n);
    setGrid((g) =>
      g.map((row) => {
        const copy = row.slice(0, n);
        while (copy.length < n) copy.push(false);
        return copy;
      })
    );
  }
  function toggleSteps() {
    setStepsCount(steps === 16 ? 32 : 16);
  }

  /* ---------- Reproducción del sample completo ---------- */
  const [samplePlaying, setSamplePlaying] = useState(false);

  async function playFullSample() {
    await Tone.start();
    if (!playerRef.current) return;
    playerRef.current.stop();
    playerRef.current.start();
    setSamplePlaying(true);
    playerRef.current.onstop = () => setSamplePlaying(false);
  }

  function stopFullSample() {
    if (!playerRef.current) return;
    playerRef.current.stop();
    setSamplePlaying(false);
  }

  /* ---------- MODAL de configuración ---------- */
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedFx, setSelectedFx] = useState<SelectedFx>(null);
  const [params, setParams] = useState<Record<string, number>>({});

  function openFx(kind: SelectedFx) {
    if (!kind) return;
    setSelectedFx(kind);

    switch (kind) {
      case "eq3":
        setParams({
          low: Number(nodes.eq3.low.value),
          mid: Number(nodes.eq3.mid.value),
          high: Number(nodes.eq3.high.value),
          lowFreq: Number(nodes.eq3.lowFrequency.value),
          highFreq: Number(nodes.eq3.highFrequency.value),
        });
        break;
      case "eq8": {
        const p: Record<string, number> = {};
        EQ8_FREQS.forEach((f) => (p[`g${f}`] = (nodes.eq8Bands[EQ8_FREQS.indexOf(f)] as any).gain ?? 0));
        setParams(p);
        break;
      }
      case "reverb":
        setParams({ wet: Number(nodes.reverb.wet.value), decay: nodes.reverb.decay });
        break;
      case "delay":
        setParams({
          wet: Number(nodes.delay.wet.value),
          feedback: Number(nodes.delay.feedback.value),
          delayTime: Number(nodes.delay.delayTime.value),
        });
        break;
      case "chorus":
        setParams({
          wet: Number(nodes.chorus.wet.value),
          frequency: Number(nodes.chorus.frequency.value),
          depth: nodes.chorus.depth,
        });
        break;
      case "distortion":
        setParams({ wet: Number(nodes.distortion.wet.value), amount: nodes.distortion.distortion });
        break;
      case "bitcrush":
        setParams({ wet: Number(nodes.bitcrush.wet.value), bits: nodes.bitcrush.bits });
        break;
      case "comp":
        setParams({
          threshold: Number(nodes.comp.threshold.value),
          ratio: nodes.comp.ratio,
          attack: Number(nodes.comp.attack),
          release: Number(nodes.comp.release),
        });
        break;
      case "lowpass":
        setParams({ frequency: Number(nodes.lowpass.frequency.value), Q: Number(nodes.lowpass.Q.value) });
        break;
    }
    setModalOpen(true);
  }

  function applyParam(key: string, value: number) {
    setParams((p) => ({ ...p, [key]: value }));

    switch (selectedFx) {
      case "eq3":
        if (key === "low") nodes.eq3.low.value = value;
        if (key === "mid") nodes.eq3.mid.value = value;
        if (key === "high") nodes.eq3.high.value = value;
        if (key === "lowFreq") nodes.eq3.lowFrequency.value = value;
        if (key === "highFreq") nodes.eq3.highFrequency.value = value;
        break;
      case "eq8":
        if (key.startsWith("g")) {
          const f = Number(key.slice(1)) as Eq8Freq;
          const idx = EQ8_FREQS.indexOf(f);
          if (idx >= 0) {
            (nodes.eq8Bands[idx] as any).gain = value;
          }
        }
        break;
      case "reverb":
        if (key === "wet") nodes.reverb.wet.value = value;
        if (key === "decay") nodes.reverb.decay = value;
        break;
      case "delay":
        if (key === "wet") nodes.delay.wet.value = value;
        if (key === "feedback") nodes.delay.feedback.value = value;
        if (key === "delayTime") nodes.delay.delayTime.value = value;
        break;
      case "chorus":
        if (key === "wet") nodes.chorus.wet.value = value;
        if (key === "frequency") nodes.chorus.frequency.value = value;
        if (key === "depth") nodes.chorus.depth = value;
        break;
      case "distortion":
        if (key === "wet") nodes.distortion.wet.value = value;
        if (key === "amount") nodes.distortion.distortion = value;
        break;
      case "bitcrush":
        if (key === "wet") nodes.bitcrush.wet.value = value;
        if (key === "bits") nodes.bitcrush.bits = Math.round(value);
        break;
      case "comp":
        if (key === "threshold") nodes.comp.threshold.value = value;
        if (key === "ratio") nodes.comp.ratio = value;
        if (key === "attack") (nodes.comp.attack as any) = value;
        if (key === "release") (nodes.comp.release as any) = value;
        break;
      case "lowpass":
        if (key === "frequency") nodes.lowpass.frequency.value = value;
        if (key === "Q") nodes.lowpass.Q.value = value;
        break;
    }
  }

  function closeModal() {
    setModalOpen(false);
    setSelectedFx(null);
  }

  /* ---------------- Snapshot FX + Presets (LOCAL / NUBE) ---------------- */

  function getFxSnapshot() {
    return {
      enabled: { ...fx },
      lowpass: { frequency: +nodes.lowpass.frequency.value, Q: +nodes.lowpass.Q.value },
      eq3: {
        low: +nodes.eq3.low.value, mid: +nodes.eq3.mid.value, high: +nodes.eq3.high.value,
        lowFreq: +nodes.eq3.lowFrequency.value, highFreq: +nodes.eq3.highFrequency.value,
      },
      eq8: nodes.eq8Bands.map((b) => +((b as any).gain ?? 0)),
      comp: {
        threshold: +nodes.comp.threshold.value, ratio: nodes.comp.ratio,
        attack: +(nodes.comp.attack as any), release: +(nodes.comp.release as any),
      },
      chorus: { wet: +nodes.chorus.wet.value, frequency: +nodes.chorus.frequency.value, depth: nodes.chorus.depth },
      delay: { wet: +nodes.delay.wet.value, feedback: +nodes.delay.feedback.value, delayTime: +nodes.delay.delayTime.value },
      reverb: { wet: +nodes.reverb.wet.value, decay: nodes.reverb.decay },
      distortion: { wet: +nodes.distortion.wet.value, amount: nodes.distortion.distortion },
      bitcrush: { wet: +nodes.bitcrush.wet.value, bits: nodes.bitcrush.bits },
    };
  }

  function applyFxSnapshot(s: any) {
    if (!s) return;

    // toggles
    if (s.enabled) setFx(s.enabled);

    // lowpass
    if (s.lowpass) {
      nodes.lowpass.frequency.value = s.lowpass.frequency ?? nodes.lowpass.frequency.value;
      nodes.lowpass.Q.value = s.lowpass.Q ?? nodes.lowpass.Q.value;
    }
    // eq3
    if (s.eq3) {
      nodes.eq3.low.value = s.eq3.low ?? 0;
      nodes.eq3.mid.value = s.eq3.mid ?? 0;
      nodes.eq3.high.value = s.eq3.high ?? 0;
      nodes.eq3.lowFrequency.value = s.eq3.lowFreq ?? 200;
      nodes.eq3.highFrequency.value = s.eq3.highFreq ?? 2000;
    }
    // eq8
    if (Array.isArray(s.eq8)) {
      s.eq8.forEach((g: number, i: number) => {
        if (nodes.eq8Bands[i]) (nodes.eq8Bands[i] as any).gain = g;
      });
    }
    // comp
    if (s.comp) {
      nodes.comp.threshold.value = s.comp.threshold ?? nodes.comp.threshold.value;
      nodes.comp.ratio = s.comp.ratio ?? nodes.comp.ratio;
      (nodes.comp.attack as any) = s.comp.attack ?? nodes.comp.attack;
      (nodes.comp.release as any) = s.comp.release ?? nodes.comp.release;
    }
    // chorus
    if (s.chorus) {
      nodes.chorus.wet.value = s.chorus.wet ?? nodes.chorus.wet.value;
      nodes.chorus.frequency.value = s.chorus.frequency ?? nodes.chorus.frequency.value;
      nodes.chorus.depth = s.chorus.depth ?? nodes.chorus.depth;
    }
    // delay
    if (s.delay) {
      nodes.delay.wet.value = s.delay.wet ?? nodes.delay.wet.value;
      nodes.delay.feedback.value = s.delay.feedback ?? nodes.delay.feedback.value;
      nodes.delay.delayTime.value = s.delay.delayTime ?? nodes.delay.delayTime.value;
    }
    // reverb
    if (s.reverb) {
      nodes.reverb.wet.value = s.reverb.wet ?? nodes.reverb.wet.value;
      nodes.reverb.decay = s.reverb.decay ?? nodes.reverb.decay;
    }
    // distortion
    if (s.distortion) {
      nodes.distortion.wet.value = s.distortion.wet ?? nodes.distortion.wet.value;
      nodes.distortion.distortion = s.distortion.amount ?? nodes.distortion.distortion;
    }
    // bitcrush
    if (s.bitcrush) {
      nodes.bitcrush.wet.value = s.bitcrush.wet ?? nodes.bitcrush.wet.value;
      nodes.bitcrush.bits = s.bitcrush.bits ?? nodes.bitcrush.bits;
    }
    rebuildChain();
  }

  // ---- Guardar/Abrir: Local
  async function saveLocal() {
    const name = prompt("Nombre del patrón:", "Mi patrón");
    if (!name) return;
    const snap: PatternSnapshot = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      steps, bpm, octave, pitch,
      grid,
      fx: getFxSnapshot(),
      sampleUrl: samplerUrl ?? undefined,
    };
    saveLocalPattern(snap);
    alert("Guardado en este navegador ✅");
  }

  function openLocal() {
    const list = listLocalPatterns();
    if (!list.length) { alert("No hay patrones locales aún"); return; }
    const names = list.map((p, i) => `${i + 1}. ${p.name} (${new Date(p.createdAt).toLocaleString()})`).join("\n");
    const idx = prompt(`Elige nº para abrir:\n${names}`);
    const sel = Number(idx) - 1;
    const chosen = list[sel];
    if (!chosen) return;

    // aplica snapshot
    setStepsCount(chosen.steps);
    setGrid(chosen.grid);
    setBpm(chosen.bpm);
    setOctave(chosen.octave);
    setPitch(chosen.pitch);
    applyFxSnapshot(chosen.fx);
    if (chosen.sampleUrl) setSamplerUrl(chosen.sampleUrl);
  }

  // ---- Guardar/Abrir: Nube (Supabase Storage bucket "patterns")
  async function saveCloud() {
    const name = prompt("Nombre del patrón (nube):", "Mi patrón");
    if (!name) return;
    const json = {
      name,
      createdAt: new Date().toISOString(),
      steps, bpm, octave, pitch, grid,
      fx: getFxSnapshot(),
      sampleUrl: samplerUrl ?? null,
    };
    const device = getDeviceId();
    try {
      const path = await uploadPatternJSON(device, name, json);
      alert(`Subido a la nube ✅\n${path}`);
    } catch (e: any) {
      alert(`Error subiendo: ${e?.message || e}`);
    }
  }

  async function openCloud() {
    const device = getDeviceId();
    try {
      const items = await listCloudPatterns(device);
      if (!items?.length) { alert("No hay patrones en la nube aún"); return; }
      const names = items.map((o, i) => `${i + 1}. ${o.name}`).join("\n");
      const idx = prompt(`Elige nº para abrir:\n${names}`);
      const sel = Number(idx) - 1;
      const obj = items[sel];
      if (!obj) return;

      const path = `${device}/${obj.name}`;
      const data = await downloadPatternJSON(path);

      // aplica snapshot del JSON
      setStepsCount(data.steps);
      setGrid(data.grid);
      setBpm(data.bpm);
      setOctave(data.octave);
      setPitch(data.pitch);
      applyFxSnapshot(data.fx);
      if (data.sampleUrl) setSamplerUrl(data.sampleUrl);
    } catch (e: any) {
      alert(`Error abriendo: ${e?.message || e}`);
    }
  }

  return (
    <div
      className="min-h-screen text-gray-100"
      style={{
        backgroundImage: `linear-gradient(to top, rgba(0,0,0,.85), rgba(0,0,0,.6)), url('${BG_URL}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="mx-auto max-w-[1300px] px-4 py-6">
        {/* Header */}
        <div className="relative rounded-[24px] border-2 border-[#b2ec3a] bg-[#545454]/70 backdrop-blur-sm shadow-inner px-5 py-3 mb-6">
          {/* Volver */}
          <button
            onClick={() => navigate("/")}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-black/30 hover:bg-black/40"
            title="Volver al menú"
          >
            <ArrowLeftIcon className="h-6 w-6 text-[#b2ec3a]" />
          </button>

          <div className="flex flex-col gap-3 pl-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl sm:text-2xl font-extrabold text-black">Piano Roll – Playground</h2>

              <div className="flex flex-wrap items-center gap-3">
                {/* Octava */}
                <label className="text-black font-semibold">Octava</label>
                <select
                  className="rounded-lg bg-black/30 px-2 py-1 text-gray-100"
                  value={octave}
                  onChange={(e) => setOctave(parseInt(e.target.value))}
                >
                  {[2,3,4,5,6,7].map(o => <option key={o} value={o}>{o}</option>)}
                </select>

                {/* Pitch */}
                <label className="text-black font-semibold ml-2">Pitch</label>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={pitch}
                  onChange={(e) => setPitch(parseInt(e.target.value))}
                  className="w-40"
                  title="Transponer en semitonos"
                />
                <span className="text-black font-semibold w-14 text-center">
                  {pitch > 0 ? `+${pitch}` : pitch}
                </span>

                {/* BPM */}
                <label className="text-black font-semibold ml-2">BPM</label>
                <input
                  type="range"
                  min={60}
                  max={180}
                  value={bpm}
                  onChange={(e) => setBpm(+e.target.value)}
                  className="w-40"
                />
                <span className="text-black font-semibold w-10 text-center">{bpm}</span>

                {/* Transport */}
                <button
                  onClick={togglePlay}
                  className="rounded-xl bg-[#b2ec3a] px-4 py-2 text-black font-bold hover:brightness-95"
                >
                  {isPlaying ? "Detener" : "Reproducir"}
                </button>

                <button
                  onClick={clearGrid}
                  className="rounded-xl bg-black/70 px-4 py-2 text-white hover:bg-black/80"
                >
                  Limpiar
                </button>

                {/* Cargar sonido */}
                <label className="ml-2 rounded-xl bg-neutral-800 px-3 py-2 cursor-pointer hover:bg-neutral-700">
                  <input type="file" accept="audio/*" className="hidden" onChange={onFile} />
                  Cargar sonido
                </label>

                {/* Reproducir sample completo */}
                <button
                  onClick={samplePlaying ? stopFullSample : playFullSample}
                  className="rounded-xl bg-black/70 px-3 py-2 text-white hover:bg-black/80 disabled:opacity-50"
                  disabled={!playerRef.current}
                  title="Reproducir el sample completo a través de los FX"
                >
                  {samplePlaying ? "Detener sample" : "Reproducir sample"}
                </button>

                {/* Switch 16/32 pasos */}
                <button
                  onClick={toggleSteps}
                  className="ml-2 rounded-xl bg-neutral-800 px-3 py-2 text-white hover:bg-neutral-700"
                  title="Cambiar entre 16 y 32 pasos"
                >
                  Pasos: {steps}
                </button>
              </div>
            </div>

            {/* ⬇️ Botonera de Guardar/Abrir (Local / Nube) */}
            <div className="flex flex-wrap gap-2">
              <button onClick={saveLocal} className="rounded-xl bg-black/70 px-3 py-2 text-white hover:bg-black/80">
                Guardar (local)
              </button>
              <button onClick={openLocal} className="rounded-xl bg-black/70 px-3 py-2 text-white hover:bg-black/80">
                Abrir (local)
              </button>

              <button onClick={saveCloud} className="rounded-xl bg-[#b2ec3a] px-3 py-2 text-black font-bold hover:brightness-95">
                Guardar (nube)
              </button>
              <button onClick={openCloud} className="rounded-xl bg-[#b2ec3a] px-3 py-2 text-black font-bold hover:brightness-95">
                Abrir (nube)
              </button>
            </div>
          </div>
        </div>

        {/* Layout principal */}
        <div className="grid grid-cols-3 gap-6">
          {/* Piano Roll */}
          <div className="col-span-2 rounded-[24px] border-2 border-[#b2ec3a] bg-black/30 backdrop-blur-sm p-3">
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-1">
                <tbody>
                  {NOTES.map((note, r) => (
                    <tr key={note}>
                      <td className="w-16 select-none text-right pr-2 text-sm text-gray-200">{note}</td>
                      {Array.from({ length: steps }).map((_, c) => {
                        const on = grid[r][c];
                        const isActiveCol = activeCol === c;
                        return (
                          <td key={c}>
                            <button
                              onClick={() => toggleCell(r, c)}
                              className={[
                                "h-8 w-8 rounded-md transition",
                                on ? "bg-[#b2ec3a] ring-2 ring-[#d8ff7a]" : "bg-neutral-700/60 hover:bg-neutral-600",
                                isActiveCol ? "outline outline-2 outline-lime-300/60" : "",
                              ].join(" ")}
                              title={`${note} • paso ${c + 1}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Panel de “plugins” */}
          <aside className="col-span-1 rounded-[24px] border-2 border-[#b2ec3a] bg-black/30 backdrop-blur-sm p-4">
            <h3 className="text-xl font-bold text-[#b2ec3a] mb-3">Plugins gratuitos</h3>

            <FxRow label="EQ3"        enabled={fx.eq3}        onToggle={(v) => setFx((s) => ({ ...s, eq3: v }))}        onEdit={() => openFx("eq3")} />
            <FxRow label="EQ 8 bandas" enabled={fx.eq8}        onToggle={(v) => setFx((s) => ({ ...s, eq8: v }))}        onEdit={() => openFx("eq8")} />
            <FxRow label="Compresor"  enabled={fx.comp}       onToggle={(v) => setFx((s) => ({ ...s, comp: v }))}       onEdit={() => openFx("comp")} />
            <FxRow label="Reverb"     enabled={fx.reverb}     onToggle={(v) => setFx((s) => ({ ...s, reverb: v }))}     onEdit={() => openFx("reverb")} />
            <FxRow label="Delay"      enabled={fx.delay}      onToggle={(v) => setFx((s) => ({ ...s, delay: v }))}      onEdit={() => openFx("delay")} />
            <FxRow label="Chorus"     enabled={fx.chorus}     onToggle={(v) => setFx((s) => ({ ...s, chorus: v }))}     onEdit={() => openFx("chorus")} />
            <FxRow label="Distortion" enabled={fx.distortion} onToggle={(v) => setFx((s) => ({ ...s, distortion: v }))} onEdit={() => openFx("distortion")} />
            <FxRow label="BitCrusher" enabled={fx.bitcrush}   onToggle={(v) => setFx((s) => ({ ...s, bitcrush: v }))}   onEdit={() => openFx("bitcrush")} />
            <FxRow label="LowPass"    enabled={fx.lowpass}    onToggle={(v) => setFx((s) => ({ ...s, lowpass: v }))}    onEdit={() => openFx("lowpass")} />
          </aside>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && selectedFx && (
        <Modal onClose={closeModal} title={`Ajustes: ${selectedFx.toUpperCase()}`}>
          {/* EQ3 */}
          {selectedFx === "eq3" && (
            <div className="space-y-4">
              <LabeledSlider label={`Low (dB): ${((params.low ?? 0)).toFixed(1)}`}  min={-12} max={12} step={0.1}
                value={params.low ?? 0} onChange={(v) => applyParam("low", v)} />
              <LabeledSlider label={`Mid (dB): ${((params.mid ?? 0)).toFixed(1)}`}  min={-12} max={12} step={0.1}
                value={params.mid ?? 0} onChange={(v) => applyParam("mid", v)} />
              <LabeledSlider label={`High (dB): ${((params.high ?? 0)).toFixed(1)}`} min={-12} max={12} step={0.1}
                value={params.high ?? 0} onChange={(v) => applyParam("high", v)} />
              <LabeledSlider label={`Low Freq: ${Math.round(params.lowFreq ?? 200)} Hz`} min={60} max={800} step={5}
                value={params.lowFreq ?? 200} onChange={(v) => applyParam("lowFreq", v)} />
              <LabeledSlider label={`High Freq: ${Math.round(params.highFreq ?? 2000)} Hz`} min={1000} max={6000} step={10}
                value={params.highFreq ?? 2000} onChange={(v) => applyParam("highFreq", v)} />
            </div>
          )}

          {/* EQ8 */}
          {selectedFx === "eq8" && (
            <div className="space-y-3">
              {EQ8_FREQS.map((f) => {
                const key = `g${f}`;
                const val = params[key] ?? 0;
                return (
                  <LabeledSlider
                    key={key}
                    label={`${f >= 1000 ? f / 1000 + "k" : f} Hz: ${(val as number).toFixed(1)} dB`}
                    min={-12}
                    max={12}
                    step={0.1}
                    value={val}
                    onChange={(v) => applyParam(key, v)}
                  />
                );
              })}
              <p className="text-xs text-gray-300">Cada banda es un filtro “peaking” con Q≈1.0 (serie).</p>
            </div>
          )}

          {selectedFx === "reverb" && (
            <div className="space-y-4">
              <LabeledSlider label={`Dry/Wet: ${Math.round((params.wet ?? 0) * 100)}%`} min={0} max={1} step={0.01}
                value={params.wet ?? 0.25} onChange={(v) => applyParam("wet", v)} />
              <LabeledSlider label={`Decay: ${(params.decay ?? 2.8).toFixed(2)}s`} min={0.1} max={8} step={0.1}
                value={params.decay ?? 2.8} onChange={(v) => applyParam("decay", v)} />
            </div>
          )}

          {selectedFx === "delay" && (
            <div className="space-y-4">
              <LabeledSlider label={`Dry/Wet: ${Math.round((params.wet ?? 0) * 100)}%`} min={0} max={1} step={0.01}
                value={params.wet ?? 0.2} onChange={(v) => applyParam("wet", v)} />
              <LabeledSlider label={`Feedback: ${Math.round((params.feedback ?? 0) * 100)}%`} min={0} max={0.9} step={0.01}
                value={params.feedback ?? 0.25} onChange={(v) => applyParam("feedback", v)} />
              <LabeledSlider label={`Delay Time: ${(params.delayTime ?? 0.25).toFixed(2)}s`} min={0} max={0.6} step={0.01}
                value={params.delayTime ?? 0.25} onChange={(v) => applyParam("delayTime", v)} />
            </div>
          )}

          {selectedFx === "chorus" && (
            <div className="space-y-4">
              <LabeledSlider label={`Dry/Wet: ${Math.round((params.wet ?? 0) * 100)}%`} min={0} max={1} step={0.01}
                value={params.wet ?? 0.25} onChange={(v) => applyParam("wet", v)} />
              <LabeledSlider label={`Frequency: ${(params.frequency ?? 1.5).toFixed(2)} Hz`} min={0.1} max={5} step={0.1}
                value={params.frequency ?? 1.5} onChange={(v) => applyParam("frequency", v)} />
              <LabeledSlider label={`Depth: ${Math.round((params.depth ?? 0.5) * 100)}%`} min={0} max={1} step={0.01}
                value={params.depth ?? 0.5} onChange={(v) => applyParam("depth", v)} />
            </div>
          )}

          {selectedFx === "distortion" && (
            <div className="space-y-4">
              <LabeledSlider label={`Dry/Wet: ${Math.round((params.wet ?? 0) * 100)}%`} min={0} max={1} step={0.01}
                value={params.wet ?? 0.15} onChange={(v) => applyParam("wet", v)} />
              <LabeledSlider label={`Amount: ${Math.round((params.amount ?? 0.2) * 100)}%`} min={0} max={1} step={0.01}
                value={params.amount ?? 0.2} onChange={(v) => applyParam("amount", v)} />
            </div>
          )}

          {selectedFx === "bitcrush" && (
            <div className="space-y-4">
              <LabeledSlider label={`Dry/Wet: ${Math.round((params.wet ?? 0) * 100)}%`} min={0} max={1} step={0.01}
                value={params.wet ?? 0.2} onChange={(v) => applyParam("wet", v)} />
              <LabeledSlider label={`Bits: ${Math.round(params.bits ?? 6)}`} min={1} max={16} step={1}
                value={params.bits ?? 6} onChange={(v) => applyParam("bits", v)} />
            </div>
          )}

          {selectedFx === "comp" && (
            <div className="space-y-4">
              <LabeledSlider label={`Threshold: ${Math.round(params.threshold ?? -24)} dB`} min={-60} max={0} step={1}
                value={params.threshold ?? -24} onChange={(v) => applyParam("threshold", v)} />
              <LabeledSlider label={`Ratio: ${(params.ratio ?? 4).toFixed(2)}:1`} min={1} max={20} step={0.1}
                value={params.ratio ?? 4} onChange={(v) => applyParam("ratio", v)} />
              <LabeledSlider label={`Attack: ${(params.attack ?? 0.01).toFixed(3)}s`} min={0} max={0.1} step={0.001}
                value={params.attack ?? 0.01} onChange={(v) => applyParam("attack", v)} />
              <LabeledSlider label={`Release: ${(params.release ?? 0.25).toFixed(2)}s`} min={0} max={1} step={0.01}
                value={params.release ?? 0.25} onChange={(v) => applyParam("release", v)} />
              <p className="text-xs text-gray-300">Nota: el compresor de Tone no tiene “wet” nativo.</p>
            </div>
          )}

          {selectedFx === "lowpass" && (
            <div className="space-y-4">
              <LabeledSlider label={`Frequency: ${Math.round(params.frequency ?? 14000)} Hz`} min={200} max={16000} step={10}
                value={params.frequency ?? 14000} onChange={(v) => applyParam("frequency", v)} />
              <LabeledSlider label={`Q: ${(params.Q ?? 0.7).toFixed(2)}`} min={0} max={12} step={0.1}
                value={params.Q ?? 0.7} onChange={(v) => applyParam("Q", v)} />
              <p className="text-xs text-gray-300">Nota: el filtro no tiene “wet”; actúa en serie.</p>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button onClick={closeModal} className="rounded-xl bg-[#b2ec3a] px-4 py-2 text-black font-bold hover:brightness-95">
              Cerrar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------- UI helpers ---------- */

function FxRow({ label, enabled, onToggle, onEdit }: {
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={onEdit}
          className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700"
          title={`Editar ${label}`}
        >
          <GearIcon className="h-4 w-4 text-[#b2ec3a]" />
        </button>
        <input
          type="checkbox"
          className="h-5 w-5 accent-[#b2ec3a]"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative max-w-lg w-[92%] rounded-2xl border-2 border-[#b2ec3a] bg-[#545454] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-xl font-bold text-black">{title}</h4>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-black/10" title="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LabeledSlider({ label, min, max, step, value, onChange }: {
  label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span>{label}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full"
      />
    </div>
  );
}

/* ---------- Iconos ---------- */
function GearIcon({ className = "", size = 24 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm9.4 3.1-1.6-.3a7.8 7.8 0 0 0-.8-1.9l.9-1.4a.9.9 0 0 0-.1-1.1l-1.6-1.6a.9.9 0 0 0-1.1-.1l-1.4.9a7.8 7.8 0 0 0-1.9-.8l-.3-1.6a.9.9 0 0 0-.9-.7h-2.3a.9.9 0 0 0-.9.7l-.3 1.6c-.7.2-1.3.5-1.9.8l-1.4-.9a.9.9 0 0 0-1.1.1L3.2 6a.9.9 0 0 0-.1 1.1l.9 1.4c-.3.6-.6 1.2-.8 1.9l-1.6.3a.9.9 0 0 0-.7.9v2.3c0 .4-.3.8-.7.9Z" />
    </svg>
  );
}

function ArrowLeftIcon({ className = "", size = 24 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H20a1 1 0 1 1 0 2h-9.6l4.3 4.3a1 1 0 1 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" />
    </svg>
  );
}
