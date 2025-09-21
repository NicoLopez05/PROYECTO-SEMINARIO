import React from "react";
import { useNavigate } from "react-router-dom";

const BG_URL = "/img/background-software.png";
const TITLE_URL = "/img/soundguide-title.png";

const CARD = { w: "w-[360px]", h: "h-[460px]" };
const ICON = { s: 240 };

type LearningMenuProps = { onSelect?: (key: string) => void };

type MenuCardProps = {
  title: string;
  Icon?: React.ComponentType<{ size?: number }>;
  imgSrc?: string;
  imgAlt?: string;
  onClick?: () => void;
};

export default function LearningMenu({ onSelect = () => {} }: LearningMenuProps) {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen text-gray-100 antialiased"
      style={{
        backgroundImage: `linear-gradient(to top, rgba(38, 37, 37, 0), rgba(35, 35, 35, 0)), url('${BG_URL}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="mx-auto max-w-[1300px] px-4 py-6">
        {/* Barra superior */}
        <div className="rounded-[24px] border-2 border-[#b2ec3a] bg-[#545454]/70 backdrop-blur-sm shadow-inner">
          <div className="grid grid-cols-3 items-center px-5 sm:px-8 py-4">
            <HeaderLeft />
            <HeaderLogo />
            <HeaderRight />
          </div>
        </div>

        {/* Título */}
        <h1 className="mt-6 text-center text-3xl sm:text-4xl font-black tracking-wide text-[#b2ec3a] drop-shadow">
          ¿Qué deseas aprender hoy?
        </h1>

        {/* Tarjetas */}
        <div className="mt-6 grid grid-cols-3 place-items-center gap-6 sm:gap-8">
          <MenuCard title="Guitarra" imgSrc="/img/guitarra.png" onClick={() => navigate("/guitarra")}  />
          <MenuCard title="Piano" imgSrc="/img/piano.png" onClick={() => onSelect("piano")} />
          <MenuCard title="FL STUDIO" imgSrc="/img/fl.png" onClick={() => navigate("/fl")} />
        </div>
      </div>
    </div>
  );
}

function HeaderLeft() {
  return (
    <div className="flex items-center gap-3">
      <GearIcon className="h-9 w-9 text-[#b2ec3a]" />
      <span className="text-2xl font-extrabold tracking-wide text-black">OPCIONES</span>
    </div>
  );
}

function HeaderLogo() {
  return (
    <div className="flex justify-center">
      <img
        src={TITLE_URL}
        alt="SOUNDGUIDE"
        className="h-20 sm:h-12 md:h-14 lg:h-48 w-auto object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,.45)] select-none pointer-events-none"
      />
    </div>
  );
}

function HeaderRight() {
  return (
    <div className="flex items-center gap-3 justify-end">
      <span className="text-2xl font-extrabold tracking-wide text-black">PLUGINS</span>
      <FolderPenIcon className="h-9 w-9 text-[#b2ec3a]" />
    </div>
  );
}

const MenuCard: React.FC<MenuCardProps> = ({ title, Icon, imgSrc, imgAlt, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`group relative ${CARD.w} ${CARD.h} overflow-hidden
                  rounded-[26px] border-2 border-[#b2ec3a]
                  bg-[#5a5a5a]/50 p-6 shadow-xl outline-none
                  transition-transform hover:scale-[1.02]
                  focus-visible:ring-4 focus-visible:ring-[#b2ec3a]/30`}
    >
      {/* Fondo translúcido de la tarjeta */}
      <div
        className="absolute inset-0 -z-10 rounded-[26px] opacity-20"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,.45), rgba(0,0,0,.75)), url('${BG_URL}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />

      <div className="flex h-full flex-col items-center justify-between">
        <div className="flex-1 flex items-center justify-center">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={imgAlt || title}
              className="max-h-[260px] w-auto object-contain select-none pointer-events-none drop-shadow"
            />
          ) : Icon ? (
            <Icon size={ICON.s} />
          ) : null}
        </div>
        <div className="pt-4 text-center">
          <p className="text-3xl sm:text-4xl font-black tracking-wider text-black">{title}</p>
        </div>
      </div>

      {/* Halo verde al hover */}
      <div className="pointer-events-none absolute inset-0 rounded-[26px] ring-0 ring-[#b2ec3a]/0 transition group-hover:ring-8 group-hover:ring-[#b2ec3a]/20" />
    </button>
  );
};

/* ===== ICONOS (simples) ===== */
function GearIcon({ className = "", size = 24 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} width={size} height={size} fill="currentColor">
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm9.4 3.1-1.6-.3a7.8 7.8 0 0 0-.8-1.9l.9-1.4a.9.9 0 0 0-.1-1.1l-1.6-1.6a.9.9 0 0 0-1.1-.1l-1.4.9a7.8 7.8 0 0 0-1.9-.8l-.3-1.6a.9.9 0 0 0-.9-.7h-2.3a.9.9 0 0 0-.9.7l-.3 1.6c-.7.2-1.3.5-1.9.8l-1.4-.9a.9.9 0 0 0-1.1.1L3.2 6a.9.9 0 0 0-.1 1.1l.9 1.4c-.3.6-.6 1.2-.8 1.9l-1.6.3a.9.9 0 0 0-.7.9v2.3c0 .4.3.8.7.9l1.6.3c.2.7.5 1.3.8 1.9l-.9 1.4a.9.9 0 0 0 .1 1.1l1.6 1.6c.3.3.7.3 1.1.1l1.4-.9c.6.3 1.2.6 1.9.8l.3 1.6c.1.4.5.7.9.7h2.3c.4 0 .8-.3.9-.7l.3-1.6c.7-.2 1.3-.5 1.9-.8l1.4.9c.4.2.8.2 1.1-.1l1.6-1.6c.3-.3.3-.7.1-1.1l-.9-1.4c.3-.6.6-1.2.8-1.9l1.6-.3c.4-.1.7-.5.7-.9v-2.3c0-.4-.3-.8-.7-.9Z" />
    </svg>
  );
}

function FolderPenIcon({ className = "", size = 24 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} width={size} height={size} fill="currentColor">
      <path d="M3 6a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v2H3V6Zm0 4h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8Zm13.9 1.7-4.3 4.3-.6 2.3 2.3-.6 4.3-4.3c.3-.3.3-.8 0-1.1l-.6-.6c-.3-.3-.8-.3-1.1 0Z" />
    </svg>
  );
}
