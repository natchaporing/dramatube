import clsx from "clsx";

/** A channel picture, or its initial on a colour derived from its handle. */
export function Avatar({
  name,
  handle,
  url,
  size = 36,
  className,
}: {
  name: string;
  handle: string;
  url: string | null;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        style={style}
        className={clsx("shrink-0 rounded-full bg-raised object-cover", className)}
      />
    );
  }
  let hash = 0;
  for (const char of handle) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return (
    <span
      aria-hidden="true"
      style={{ ...style, background: `oklch(0.55 0.13 ${hue})` }}
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white uppercase", className)}
    >
      {Array.from(name.trim() || handle)[0]}
    </span>
  );
}
