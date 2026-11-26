import React from "react";

interface IosSwitchProps {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  accent?: "green" | "blue";
}

export const IosSwitch: React.FC<IosSwitchProps> = ({
  checked,
  onChange,
  ariaLabel,
  accent = "green",
}) => {
  const activeBg = accent === "blue" ? "bg-[#0A84FF]" : "bg-[#30D158]";

  return (
    <span className="relative inline-flex h-[20px] w-[36px] shrink-0 items-center cursor-pointer">
      <input
        type="checkbox"
        aria-label={ariaLabel}
        checked={checked}
        onChange={onChange}
        className="sr-only peer"
      />
      <span
        aria-hidden="true"
        className={`h-full w-full rounded-full transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] peer-focus-visible:ring-2 peer-focus-visible:ring-[#0A84FF] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#141418] ${
          checked ? activeBg : "bg-white/[0.16]"
        }`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-[2px] h-[16px] w-[16px] rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.45)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          checked ? "translate-x-[16px]" : "translate-x-0"
        }`}
      />
    </span>
  );
};
