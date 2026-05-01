import Link from "next/link";

export default function LogoCloud() {
  return (
    <div className="flex items-center justify-center">
      <Link href="https://github.com/nodetool-ai/nodetool" target="_blank">
        <img
          className="object-contain"
          src="github-mark-white.svg"
          alt=""
          width={48}
          height={48}
        />
      </Link>
    </div>
  );
}
