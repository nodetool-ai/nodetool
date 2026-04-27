import React from "react";
import Image from "next/image";

type LogoProps = {};
const Logo = ({}: LogoProps) => {
  return (
    <div
      className="flex flex-col items-center justify-center text-center select-none cursor-pointer transition-all duration-400"
      style={{
        width: "160px",
        height: "160px",
        fontSize: "5em",
        lineHeight: ".9em",
        padding: "0.2em 0 0",
        color: "#222",
        borderRadius: ".1em",
        boxSizing: "border-box",
      }}
    >
      <Image src="/logo.png" alt="NodeTool" width={200} height={200} />
      <span className="text-primary text-6xl mb-40 mt-4 uppercase bg-gradient-to-t from-white via-white to-[#51797e] font-jetbrains text-transparent bg-clip-text">
        NodeTool
      </span>
    </div>
  );
};
export default Logo;
